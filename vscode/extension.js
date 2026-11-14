// Renders .swarmod/sky.svg (written by the swarmod sky hook) in a bottom panel tab.
const vscode = require('vscode')

exports.activate = ctx => {
  let view
  const show = async () => {
    if (!view) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri
    let svg = '<p style="opacity:.6">No swarmod activity yet: start a Claude Code session in this folder.</p>'
    try { if (root) svg = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, '.swarmod/sky.svg'))).toString('utf8') } catch {}
    view.webview.html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
      `<style>body{margin:0;padding:6px;height:100vh;box-sizing:border-box;display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%}</style>${svg}`
  }
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('swarmod.sky', {
    resolveWebviewView(v) { view = v; v.onDidChangeVisibility(show); show() },
  }))
  const w = vscode.workspace.createFileSystemWatcher('**/.swarmod/sky.svg')
  w.onDidChange(show); w.onDidCreate(show)
  ctx.subscriptions.push(w)
}
