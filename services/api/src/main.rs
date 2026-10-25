#![forbid(unsafe_code)]

mod adapters;
mod model;
mod model_import;
mod module_manager;
mod boot_manager;
mod host_inventory;
mod imu;
mod routes;
mod state;

use state::AppState;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let robots_path = std::env::var("CONSOLE_ROBOTS_FILE").unwrap_or_else(|_| "config/robots.json".into());
    let modules_path = std::env::var("CONSOLE_MODULES_FILE").unwrap_or_else(|_| "config/modules.json".into());
    let address = std::env::var("CONSOLE_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into());

    let data_dir = std::env::var("CONSOLE_DATA_DIR").unwrap_or_else(|_| "data".into());
    let state = AppState::from_files_with_data(&robots_path, &modules_path, &data_dir)?;
    tracing::info!(robots=state.robots.len(), "console registry loaded; onboarding writes enabled; ACTUATION DISABLED");
    state.spawn_simulators();

    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(%address, "OpenRGD Console API ready; no motor control surface");
    axum::serve(listener, routes::router(state)).await?;
    Ok(())
}
