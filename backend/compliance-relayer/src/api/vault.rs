//! Vault pricing API routes.
//!
//! Provides endpoints for:
//! - Commodity prices for vault collateralization
//! - Vault TVL and NAV calculations
//! - Historical price data

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::app::AppState;

/// Response for vault pricing data
#[derive(Debug, Serialize)]
pub struct VaultPricingResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Query parameters for commodity prices
#[derive(Debug, Deserialize)]
pub struct PriceQuery {
    pub symbols: Option<String>,
}

/// Query parameters for historical prices
#[derive(Debug, Deserialize)]
pub struct HistoricalPriceQuery {
    pub symbol: String,
    pub days: Option<u32>,
}

/// Commodity price data
#[derive(Debug, Serialize)]
pub struct CommodityPrice {
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub currency: String,
    pub timestamp: i64,
    pub change_24h: f64,
    pub change_percent_24h: f64,
}

/// Quote data with bid/ask spread
#[derive(Debug, Serialize)]
pub struct PriceQuote {
    pub bid: f64,
    pub ask: f64,
    pub last: f64,
    pub volume_24h: u64,
    pub timestamp: i64,
}

/// Reference commodity prices (simulated for devnet)
fn get_reference_prices() -> std::collections::HashMap<&'static str, (f64, &'static str)> {
    let mut prices = std::collections::HashMap::new();
    prices.insert("XAU", (2450.50, "Gold"));
    prices.insert("XAG", (28.75, "Silver"));
    prices.insert("XPT", (980.30, "Platinum"));
    prices.insert("XPD", (1050.80, "Palladium"));
    prices.insert("CL", (78.50, "Crude Oil"));
    prices.insert("NG", (3.25, "Natural Gas"));
    prices.insert("HG", (4.15, "Copper"));
    prices.insert("W", (6.85, "Wheat"));
    prices
}

/// GET /api/vault/prices
/// Fetch current commodity prices
pub async fn get_commodity_prices(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PriceQuery>,
) -> impl IntoResponse {
    let reference_prices = get_reference_prices();
    
    // Parse requested symbols
    let symbols: Vec<&str> = match &query.symbols {
        Some(s) => s.split(',').map(|s| s.trim()).collect(),
        None => reference_prices.keys().copied().collect(),
    };

    // If SIX client is available, try to get real prices
    if let Some(six_client) = &state.six_client {
        let mut prices = Vec::new();
        
        for symbol in &symbols {
            // Try to get from SIX API first
            match six_client.get_precious_metal_price(symbol).await {
                Ok(metal_price) => {
                    prices.push(CommodityPrice {
                        symbol: symbol.to_string(),
                        name: metal_price.metal.clone(),
                        price: metal_price.price_per_oz,
                        currency: metal_price.currency,
                        timestamp: metal_price.timestamp,
                        change_24h: 0.0, // SIX doesn't provide 24h change directly
                        change_percent_24h: 0.0,
                    });
                }
                Err(_) => {
                    // Fall back to reference prices
                    if let Some(&(base_price, name)) = reference_prices.get(symbol) {
                        let variance = (rand::random::<f64>() - 0.5) * base_price * 0.01;
                        let change = (rand::random::<f64>() - 0.5) * base_price * 0.02;
                        
                        prices.push(CommodityPrice {
                            symbol: symbol.to_string(),
                            name: name.to_string(),
                            price: (base_price + variance * 100.0).round() / 100.0,
                            currency: "USD".to_string(),
                            timestamp: chrono::Utc::now().timestamp(),
                            change_24h: (change * 100.0).round() / 100.0,
                            change_percent_24h: (change / base_price * 10000.0).round() / 100.0,
                        });
                    }
                }
            }
        }
        
        return Json(VaultPricingResponse {
            success: true,
            data: Some(serde_json::to_value(prices).unwrap_or_default()),
            error: None,
        });
    }

    // SIX client not available, use reference prices
    let prices: Vec<CommodityPrice> = symbols
        .iter()
        .filter_map(|symbol| {
            reference_prices.get(symbol).map(|&(base_price, name)| {
                let variance = (rand::random::<f64>() - 0.5) * base_price * 0.01;
                let change = (rand::random::<f64>() - 0.5) * base_price * 0.02;
                
                CommodityPrice {
                    symbol: symbol.to_string(),
                    name: name.to_string(),
                    price: (base_price + variance * 100.0).round() / 100.0,
                    currency: "USD".to_string(),
                    timestamp: chrono::Utc::now().timestamp(),
                    change_24h: (change * 100.0).round() / 100.0,
                    change_percent_24h: (change / base_price * 10000.0).round() / 100.0,
                }
            })
        })
        .collect();

    Json(VaultPricingResponse {
        success: true,
        data: Some(serde_json::to_value(prices).unwrap_or_default()),
        error: None,
    })
}

/// GET /api/vault/quote/{symbol}
/// Get a price quote with bid/ask spread
pub async fn get_price_quote(
    State(_state): State<Arc<AppState>>,
    Path(symbol): Path<String>,
) -> impl IntoResponse {
    let reference_prices = get_reference_prices();
    
    let base_price = reference_prices
        .get(symbol.as_str())
        .map(|&(price, _)| price)
        .unwrap_or(100.0);
    
    let spread = base_price * 0.001; // 0.1% spread
    
    let quote = PriceQuote {
        bid: ((base_price - spread / 2.0) * 100.0).round() / 100.0,
        ask: ((base_price + spread / 2.0) * 100.0).round() / 100.0,
        last: base_price,
        volume_24h: rand::random::<u64>() % 1_000_000,
        timestamp: chrono::Utc::now().timestamp(),
    };

    Json(VaultPricingResponse {
        success: true,
        data: Some(serde_json::to_value(quote).unwrap_or_default()),
        error: None,
    })
}

/// GET /api/vault/prices/history
/// Get historical prices for a commodity
pub async fn get_historical_prices(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<HistoricalPriceQuery>,
) -> impl IntoResponse {
    let reference_prices = get_reference_prices();
    let days = query.days.unwrap_or(30);
    
    let base_price = reference_prices
        .get(query.symbol.as_str())
        .map(|&(price, _)| price)
        .unwrap_or(100.0);
    
    // Generate simulated historical data
    let mut history = Vec::new();
    for i in (0..=days).rev() {
        let date = chrono::Utc::now() - chrono::Duration::days(i as i64);
        let variance = (rand::random::<f64>() - 0.5) * base_price * 0.05;
        let trend = (days as f64 - i as f64) * (base_price * 0.001);
        
        history.push(serde_json::json!({
            "date": date.format("%Y-%m-%d").to_string(),
            "price": ((base_price + variance + trend) * 100.0).round() / 100.0,
        }));
    }

    Json(VaultPricingResponse {
        success: true,
        data: Some(serde_json::to_value(history).unwrap_or_default()),
        error: None,
    })
}

/// GET /api/vault/tvl
/// Get current vault TVL (Total Value Locked)
pub async fn get_vault_tvl(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // In production, this would query the Solana program for the actual vault state
    // For devnet, return simulated data
    
    let tvl_data = serde_json::json!({
        "total_deposits": 1_500_000,
        "total_supply": 1_500_000,
        "usx_allocation_bps": 7000,
        "usx_allocated": 1_050_000,
        "pending_yield": 150,
        "last_yield_claim": chrono::Utc::now().timestamp() - 86400,
    });

    Json(VaultPricingResponse {
        success: true,
        data: Some(tvl_data),
        error: None,
    })
}

/// GET /api/vault/status
/// Get vault operational status
pub async fn get_vault_status(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let six_healthy = match &state.six_client {
        Some(client) => client.health_check().await,
        None => false,
    };

    let status = serde_json::json!({
        "paused": false,
        "six_connected": six_healthy,
        "secondary_market_enabled": false,
        "network": "devnet",
    });

    Json(VaultPricingResponse {
        success: true,
        data: Some(status),
        error: None,
    })
}
