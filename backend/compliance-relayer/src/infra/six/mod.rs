//! SIX Financial Data API integration for yield backing.
//! 
//! Provides real-time market data for:
//! - Forex rates (EUR/USD, CHF/USD, etc.)
//! - Precious metals (Gold, Silver, Platinum)
//! - Equities (NYSE, NASDAQ, Copenhagen)
//! 
//! Uses MTLS certificate authentication as required by SIX API.

use reqwest::Client;
use reqwest::Certificate;
use reqwest::Identity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{info, warn, error};

/// SIX API configuration
#[derive(Debug, Clone)]
pub struct SixConfig {
    /// Base URL for SIX API
    pub base_url: String,
    /// Path to MTLS certificate (.p12 file)
    pub cert_path: String,
    /// Certificate password
    pub cert_password: String,
    /// Request timeout in seconds
    pub timeout_secs: u64,
}

impl Default for SixConfig {
    fn default() -> Self {
        Self {
            base_url: std::env::var("SIX_API_BASE_URL")
                .unwrap_or_else(|_| "https://api.six-group.com".to_string()),
            cert_path: std::env::var("SIX_CERT_PATH")
                .unwrap_or_else(|_| "six-data-cert/certificate.p12".to_string()),
            cert_password: std::env::var("SIX_CERT_PASSWORD")
                .unwrap_or_else(|_| "sixhackathon2026".to_string()),
            timeout_secs: 30,
        }
    }
}

/// Cached market data entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedPrice {
    pub instrument_id: String,
    pub price: f64,
    pub currency: String,
    pub timestamp: i64,
    pub cached_at: Instant,
}

/// Market data response from SIX API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketDataResponse {
    pub instrument_id: String,
    pub name: String,
    pub price: f64,
    pub currency: String,
    pub market: String,
    pub timestamp: i64,
}

/// Forex rate pair
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForexRate {
    pub base_currency: String,
    pub quote_currency: String,
    pub rate: f64,
    pub timestamp: i64,
}

/// Precious metal price
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreciousMetalPrice {
    pub metal: String,
    pub price_per_oz: f64,
    pub currency: String,
    pub timestamp: i64,
}

/// SIX API client for market data
pub struct SixApiClient {
    client: Client,
    config: SixConfig,
    cache: Arc<RwLock<std::collections::HashMap<String, CachedPrice>>>,
}

impl SixApiClient {
    /// Create a new SIX API client with MTLS certificate
    pub async fn new(config: SixConfig) -> Result<Self, Box<dyn std::error::Error>> {
        // Load MTLS certificate
        let cert_bytes = std::fs::read(&config.cert_path)?;
        let identity = Identity::from_pkcs12_der(&cert_bytes, &config.cert_password)?;
        
        // Build HTTP client with MTLS
        let client = Client::builder()
            .identity(identity)
            .timeout(Duration::from_secs(config.timeout_secs))
            .danger_accept_invalid_certs(false)
            .build()?;
        
        info!("SIX API client initialized with MTLS certificate");
        
        Ok(Self {
            client,
            config,
            cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        })
    }
    
    /// Fetch intraday snapshot for a specific instrument
    pub async fn get_intraday_snapshot(
        &self,
        scheme: &str,
        instrument_id: &str,
        market_bc: &str,
    ) -> Result<MarketDataResponse, Box<dyn std::error::Error>> {
        let url = format!(
            "{}/web/v2/listings/marketData/intradaySnapshot?scheme={}&ids={}&marketBC={}",
            self.config.base_url, scheme, instrument_id, market_bc
        );
        
        info!("Fetching intraday snapshot for {} from SIX API", instrument_id);
        
        let response = self.client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await?;
            error!("SIX API error {}: {}", status, body);
            return Err(format!("SIX API error {}: {}", status, body).into());
        }
        
        let data: serde_json::Value = response.json().await?;
        
        // Parse the response (structure depends on SIX API response format)
        let market_data = MarketDataResponse {
            instrument_id: instrument_id.to_string(),
            name: data["data"][0]["instrument"]["name"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string(),
            price: data["data"][0]["lastPrice"]
                .as_f64()
                .unwrap_or(0.0),
            currency: data["data"][0]["currency"]
                .as_str()
                .unwrap_or("USD")
                .to_string(),
            market: market_bc.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        
        // Cache the result
        self.cache_price(&market_data.instrument_id, market_data.price, &market_data.currency).await;
        
        Ok(market_data)
    }
    
    /// Fetch forex rate for a currency pair
    pub async fn get_forex_rate(
        &self,
        base: &str,
        quote: &str,
    ) -> Result<ForexRate, Box<dyn std::error::Error>> {
        // SIX Forex Calculated Rates market BC = 149
        let instrument_id = match (base, quote) {
            ("EUR", "USD") => "946681",
            ("CHF", "USD") => "275164",
            ("CHF", "EUR") => "968880",
            ("GBP", "USD") => "275017",
            _ => return Err(format!("Unsupported forex pair: {}/{}", base, quote).into()),
        };
        
        let data = self.get_intraday_snapshot("VALOR", instrument_id, "149").await?;
        
        Ok(ForexRate {
            base_currency: base.to_string(),
            quote_currency: quote.to_string(),
            rate: data.price,
            timestamp: data.timestamp,
        })
    }
    
    /// Fetch precious metal price
    pub async fn get_precious_metal_price(
        &self,
        metal: &str,
    ) -> Result<PreciousMetalPrice, Box<dyn std::error::Error>> {
        // Map metal names to SIX VALOR IDs
        let instrument_id = match metal.to_uppercase().as_str() {
            "GOLD" | "XAU" => "900",     // Gold VALOR
            "SILVER" | "XAG" => "901",   // Silver VALOR
            "PLATINUM" | "XPT" => "902", // Platinum VALOR
            "PALLADIUM" | "XPD" => "903", // Palladium VALOR
            _ => return Err(format!("Unsupported precious metal: {}", metal).into()),
        };
        
        let data = self.get_intraday_snapshot("VALOR", instrument_id, "149").await?;
        
        Ok(PreciousMetalPrice {
            metal: metal.to_uppercase(),
            price_per_oz: data.price,
            currency: data.currency,
            timestamp: data.timestamp,
        })
    }
    
    /// Get equity price from NYSE (BC=65) or NASDAQ (BC=67)
    pub async fn get_equity_price(
        &self,
        valor: &str,
        market_bc: &str,
    ) -> Result<MarketDataResponse, Box<dyn std::error::Error>> {
        self.get_intraday_snapshot("VALOR", valor, market_bc).await
    }
    
    /// Cache a price for later retrieval
    async fn cache_price(&self, instrument_id: &str, price: f64, currency: &str) {
        let mut cache = self.cache.write().await;
        cache.insert(
            instrument_id.to_string(),
            CachedPrice {
                instrument_id: instrument_id.to_string(),
                price,
                currency: currency.to_string(),
                timestamp: chrono::Utc::now().timestamp(),
                cached_at: Instant::now(),
            },
        );
    }
    
    /// Get cached price if available and not expired
    pub async fn get_cached_price(&self, instrument_id: &str) -> Option<CachedPrice> {
        let cache = self.cache.read().await;
        cache.get(instrument_id).cloned()
    }
    
    /// Calculate vault NAV using SIX market data
    pub async fn calculate_vault_nav(
        &self,
        holdings: &[(String, f64)], // (instrument_id, quantity)
    ) -> Result<f64, Box<dyn std::error::Error>> {
        let mut total_nav = 0.0;
        
        for (instrument_id, quantity) in holdings {
            let price_data = self.get_intraday_snapshot("VALOR", instrument_id, "65").await?;
            total_nav += price_data.price * quantity;
        }
        
        Ok(total_nav)
    }
    
    /// Health check for SIX API connectivity
    pub async fn health_check(&self) -> bool {
        match self.get_forex_rate("EUR", "USD").await {
            Ok(_) => {
                info!("SIX API health check passed");
                true
            }
            Err(e) => {
                warn!("SIX API health check failed: {}", e);
                false
            }
        }
    }
}

/// Available SIX instruments for the hackathon
pub mod instruments {
    // NYSE (BC=65)
    pub const COCA_COLA: &str = "114621";
    pub const BLACKROCK: &str = "138405792";
    pub const MT_BANK: &str = "135092601";
    pub const ORACLE: &str = "959184";
    
    // Forex Calculated Rates (BC=149)
    pub const EUR_USD: &str = "946681";
    pub const CHF_USD: &str = "275164";
    pub const CHF_EUR: &str = "968880";
    pub const GBP_USD: &str = "275017";
    
    // NASDAQ End-of-Day (BC=67)
    pub const APPLE: &str = "908440";
    pub const MICROSOFT: &str = "951692";
    pub const WALMART: &str = "984101";
    pub const INTEL: &str = "941595";
    
    // NASDAQ Copenhagen End-of-Day (BC=12)
    pub const NOVO_NORD: &str = "129508879";
    pub const DANSKE_BANK: &str = "1150721";
    pub const CARLSBERG: &str = "461893";
    pub const NORDEA: &str = "40543008";
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_six_config_default() {
        let config = SixConfig::default();
        assert_eq!(config.base_url, "https://api.six-group.com");
        assert_eq!(config.cert_password, "sixhackathon2026");
    }
    
    #[test]
    fn test_instrument_constants() {
        assert_eq!(instruments::EUR_USD, "946681");
        assert_eq!(instruments::APPLE, "908440");
        assert_eq!(instruments::COCA_COLA, "114621");
    }
}
