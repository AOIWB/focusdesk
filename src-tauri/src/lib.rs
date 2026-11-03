use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
async fn chat_completion(url: String, key: String, body: serde_json::Value) -> Result<String, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).build().map_err(|e| e.to_string())?;
    let mut request = client.post(url).json(&body);
    if !key.is_empty() { request = request.bearer_auth(key); }
    let response = request.send().await.map_err(|e| e.without_url().to_string())?;
    let status = response.status();
    let data: serde_json::Value = response.json().await.map_err(|e| format!("接口返回了非 JSON 内容：{e}"))?;
    if !status.is_success() {
        return Err(data["error"]["message"].as_str().map(String::from).unwrap_or_else(|| format!("模型请求失败：{status}")));
    }
    data["choices"][0]["message"]["content"].as_str().map(String::from).ok_or_else(|| "接口没有返回消息内容".into())
}

#[tauri::command]
fn create_workspace_directory(app: tauri::AppHandle, parent: Option<String>) -> Result<String, String> {
    let parent = match parent { Some(path) => std::path::PathBuf::from(path), None => app.path().document_dir().map_err(|e| e.to_string())? };
    let root = parent.join("松果 Pinecone");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.to_string_lossy().into_owned())
}
#[tauri::command]
fn create_project_directory(root: String, name: String) -> Result<String, String> {
    let name: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let name = name.trim().trim_end_matches('.');
    if name.is_empty() || name == "." || name == ".." { return Err("项目名称不能用作目录名".into()); }
    let path = std::path::Path::new(&root).join(name);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
#[tauri::command]
async fn repository_request(provider: String, path: String, token: String, method: String, body: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let base = match provider.as_str() { "github" => "https://api.github.com", "gitee" => "https://gitee.com/api/v5", _ => return Err("不支持的平台".into()) };
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
    let verb = method.parse::<reqwest::Method>().map_err(|e| e.to_string())?;
    let mut request = client.request(verb, format!("{base}{path}")).header("User-Agent", "Pinecone");
    if provider == "gitee" { request = request.query(&[("access_token", token)]); } else { request = request.bearer_auth(token); }
    if let Some(value) = body { request = request.json(&value); }
    let response = request.send().await.map_err(|e| e.without_url().to_string())?;
    let status = response.status().as_u16();
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({"status":status,"body":value}))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:focusdesk.db", vec![Migration {
            version: 1,
            description: "create_workspace",
            sql: "CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, value TEXT NOT NULL);",
            kind: MigrationKind::Up,
        }, Migration { version: 2, description: "local_settings_and_backups", sql: "CREATE TABLE IF NOT EXISTS local_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);", kind: MigrationKind::Up }]).build())
        .invoke_handler(tauri::generate_handler![chat_completion, create_workspace_directory, create_project_directory, repository_request])
        .run(tauri::generate_context!())
        .expect("could not start FocusDesk");
}
