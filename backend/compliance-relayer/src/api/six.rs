//! SIX Financial Data API routes for yield backing.
//!
//! Provides endpoints for:
//! - Forex rates (EUR/USD, CHF/USD, etc.)
//! - Precious metals (Gold, Silver, Platinum)
//! - Equities (NYSE, NASDAQ, Copenhagen)
//! - Vault NAV calculations

use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::app::AppState;
use crate::infra::six::instruments;

/// Response for market data
#[derive(Debug, Serialize)]
pub struct MarketDataResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Request for vault NAV calculation
#[derive(Debug, Deserialize)]
pub struct VaultNavRequest {
    pub holdings: Vec<(String, f64)>, // (instrument_id, quantity)
}

/// GET /six/forex/{base}/{quote}
/// Fetch forex rate for a currency pair
pub async fn get_forex_rate(
    State(state): State<Arc<AppState>>,
    Path((base, quote)): Path<(String, String)>,
) -> impl IntoResponse {
    let six_client = match &state.six_client {
        Some(client) => client,
        None => {
            return Json(MarketDataResponse {
                success: false,
                data: None,
                error: Some("SIX API client not initialized. Set SIX_CERT_PATH env var.".to_string()),
            })
        }
    };

    match six_client.get_forex_rate(&base, &quote).await {
        Ok(rate) => Json(MarketDataResponse {
            success: true,
            data: Some(serde_json::to_value(rate).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Json(MarketDataResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

/// GET /six/metal/{metal}
/// Fetch precious metal price
pub async fn get_precious_metal_price(
    State(state): State<Arc<AppState>>,
    Path(metal): Path<String>,
) -> impl IntoResponse {
    let six_client = match &state.six_client {
        Some(client) => client,
        None => {
            return Json(MarketDataResponse {
                success: false,
                data: None,
                error: Some("SIX API client not initialized. Set SIX_CERT_PATH env var.".to_string()),
            })
        }
    };

    match six_client.get_precious_metal_price(&metal).await {
        Ok(price) => Json(MarketDataResponse {
            success: true,
            data: Some(serde_json::to_value(price).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Json(MarketDataResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

/// GET /six/equity/{valor}/{market_bc}
/// Fetch equity price
pub async fn get_equity_price(
    State(state): State<Arc<AppState>>,
    Path((valor, market_bc)): Path<(String, String)>,
) -> impl IntoResponse {
    let six_client = match &state.six_client {
        Some(client) => client,
        None => {
            return Json(MarketDataResponse {
                success: false,
                data: None,
                error: Some("SIX API client not initialized. Set SIX_CERT_PATH env var.".to_string()),
            })
        }
    };

    match six_client.get_equity_price(&valor, &market_bc).await {
        Ok(data) => Json(MarketDataResponse {
            success: true,
            data: Some(serde_json::to_value(data).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Json(MarketDataResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

/// POST /six/nav
/// Calculate vault NAV using SIX market data
pub async fn calculate_vault_nav(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VaultNavRequest>,
) -> impl IntoResponse {
    let six_client = match &state.six_client {
        Some(client) => client,
        None => {
            return Json(MarketDataResponse {
                success: false,
                data: None,
                error: Some("SIX API client not initialized. Set SIX_CERT_PATH env var.".to_string()),
            })
        }
    };

    match six_client.calculate_vault_nav(&body.holdings).await {
        Ok(nav) => Json(MarketDataResponse {
            success: true,
            data: Some(serde_json::json!({ "nav": nav, "currency": "USD" })),
            error: None,
        }),
        Err(e) => Json(MarketDataResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

/// GET /six/health
/// Health check for SIX API connectivity
pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let six_client = match &state.six_client {
        Some(client) => client,
        None => {
            return Json(MarketDataResponse {
                success: false,
                data: Some(serde_json::json!({ "status": "not_configured" })),
                error: Some("SIX API client not initialized. Set SIX_CERT_PATH env var.".to_string()),
            })
        }
    };

    let healthy = six_client.health_check().await;

    if healthy {
        Json(MarketDataResponse {
            success: true,
            data: Some(serde_json::json!({ "status": "healthy" })),
            error: None,
        })
    } else {
        Json(MarketDataResponse {
            success: false,
            data: Some(serde_json::json!({ "status": "unhealthy" })),
            error: Some("SIX API is not reachable".to_string()),
        })
    }
}

/// GET /six/instruments
/// List available SIX instruments for the hackathon
pub async fn list_instruments() -> impl IntoResponse {
    let instruments_data = serde_json::json!({
        "nyse": {
            "market_bc": "65",
            "description": "NYSE End-of-Day prices",
            "instruments": {
                "coca_cola": { "valor": instruments::COCA_COLA, "name": "Coca-Cola" },
                "blackrock": { "valor": instruments::BLACKROCK, "name": "BlackRock" },
                "mt_bank": { "valor": instruments::MT_BANK, "name": "M&T Bank" },
                "oracle": { "valor": instruments::ORACLE, "name": "Oracle" },
            }
        },
        "forex": {
            "market_bc": "149",
            "description": "Forex Calculated Rates",
            "instruments": {
                "eur_usd": { "valor": instruments::EUR_USD, "name": "EUR/USD" },
                "chf_usd": { "valor": instruments::CHF_USD, "name": "CHF/USD" },
                "chf_eur": { "valor": instruments::CHF_EUR, "name": "CHF/EUR" },
                "gbp_usd": { "valor": instruments::GBP_USD, "name": "GBP/USD" },
            }
        },
        "nasdaq": {
            "market_bc": "67",
            "description": "NASDAQ End-of-Day prices",
            "instruments": {
                "apple": { "valor": instruments::APPLE, "name": "Apple" },
                "microsoft": { "valor": instruments::MICROSOFT, "name": "Microsoft" },
                "walmart": { "valor": instruments::WALMART, "name": "Walmart" },
                "intel": { "valor": instruments::INTEL, "name": "Intel" },
            }
        },
        "nasdaq_copenhagen": {
            "market_bc": "12",
            "description": "NASDAQ Copenhagen End-of-Day prices",
            "instruments": {
                "novo_nord": { "valor": instruments::NOVO_NORD, "name": "Novo Nordisk" },
                "danske_bank": { "valor": instruments::DANSKE_BANK, "name": "Danske Bank" },
                "carlsberg": { "valor": instruments::CARLSBERG, "name": "Carlsberg" },
                "nordea": { "valor": instruments::NORDEA, "name": "Nordea" },
            }
        },
        "metals": {
            "description": "Precious metals (use /six/metal/{metal} endpoint)",
            "supported": ["GOLD", "SILVER", "PLATINUM", "PALLADIUM"]
        }
    });

    Json(MarketDataResponse {
        success: true,
        data: Some(instruments_data),
        error: None,
    })
}
