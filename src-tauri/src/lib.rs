use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
async fn chat_completion(url: String, key: String, body: serde_json::Value) -> Result<String, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).build().map_err(|e| e.to_string())?;
    let mut request = client.post(url).json(&body);
    if !key.is_empty() { request = request.bearer_auth(key); }
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let data: serde_json::Value = response.json().await.map_err(|e| format!("接口返回了非 JSON 内容：{e}"))?;
    if !status.is_success() {
        return Err(data["error"]["message"].as_str().map(String::from).unwrap_or_else(|| format!("模型请求失败：{status}")));
    }
    data["choices"][0]["message"]["content"].as_str().map(String::from).ok_or_else(|| "接口没有返回消息内容".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:focusdesk.db", vec![Migration {
            version: 1,
            description: "create_workspace",
            sql: "CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, value TEXT NOT NULL);",
            kind: MigrationKind::Up,
        }]).build())
        .invoke_handler(tauri::generate_handler![chat_completion])
        .run(tauri::generate_context!())
        .expect("could not start FocusDesk");
}
