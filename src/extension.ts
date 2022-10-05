import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mustache from 'mustache';
import * as util from 'util';

const readdirAsync = util.promisify(fs.readdir);
const statAsync = util.promisify(fs.stat);
const readFileAsync = util.promisify(fs.readFile);
const existsAsync = util.promisify(fs.exists);

const listAllFilesAsync = async (dirPath: string): Promise<string[]> => {
	const ret: string[] = [];
	const files = await readdirAsync(dirPath)
	for (const file of files) {
		const fullPath = path.join(dirPath, file);
		if ((await statAsync(fullPath)).isDirectory()) {
			const recursiveFiles = await listAllFilesAsync(fullPath);
			recursiveFiles.forEach((e) => ret.push(e));
		} else {
			ret.push(fullPath);
		}
	}
	return ret;
};

export function activate(context: vscode.ExtensionContext) {
	let webViewPanel: vscode.WebviewPanel | undefined = undefined;
	let createWebViewPanel = async (): Promise<void> => {
		if (!vscode.workspace.workspaceFolders)
			return;

		// 获取工作路径
		const workDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'dist');
		if (!(await statAsync(workDir)).isDirectory())
			return;

		// 创建 WebView
		webViewPanel = vscode.window.createWebviewPanel(
			'luaSTGPlus',
			'LuaSTGPlus',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(context.extensionPath, 'media')),
					vscode.Uri.file(workDir),
				]
			}
		);

		// 枚举所有文件和文件夹，并生成下载路径
		const files = await listAllFilesAsync(workDir);
		const preloadFiles: [string, string][] = [];
		for (const f of files) {
			const rela = path.relative(workDir, f);
			const uri = webViewPanel.webview.asWebviewUri(vscode.Uri.file(f)).toString();
			preloadFiles.push([uri, rela]);
		}

		// 拉取网页文件，并进行替换
		const entryHtmlOnDisk = vscode.Uri.file(
			path.join(context.extensionPath, 'media', 'index.html.template')
		);
		const entryHtmlContent = await readFileAsync(entryHtmlOnDisk.path, { encoding: 'utf-8' });
		const entryHtmlContentRendered = mustache.render(entryHtmlContent, {
			preloadFiles,
			genPreloadLine: function () {
				return JSON.stringify(this as [string, string]) + ',';
			},
			jsUrl: webViewPanel.webview.asWebviewUri(vscode.Uri.file(
				path.join(context.extensionPath, 'media', 'LuaSTGPlus2.js')
			)),
			wasmUrl: webViewPanel.webview.asWebviewUri(vscode.Uri.file(
				path.join(context.extensionPath, 'media', 'LuaSTGPlus2.wasm')
			)),
		});

		// 设置 HTML 内容
		webViewPanel.webview.html = entryHtmlContentRendered;

		// 设置回调
		webViewPanel.onDidDispose(
			() => {
				webViewPanel = undefined;
				fsWatcher?.close();
				fsWatcher = undefined;
			},
			null,
			context.subscriptions
		);
	};

	let fsWatcher: fs.FSWatcher | undefined = undefined;
	let createWatcher = async (): Promise<void> => {
		if (!vscode.workspace.workspaceFolders)
			return;
		const workDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const distDir = path.join(workDir, 'dist');

		fsWatcher = fs.watch(distDir, { recursive: true, encoding: 'utf-8' }, (event: fs.WatchEventType, filename: string) => {
			if (!webViewPanel)
				return;
			if (!filename)
				return;
			const fullPath = path.join(distDir, filename);
			const uri = webViewPanel.webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();

			if (event === 'change') {
				console.log(`Post file changed message, filename: ${filename}`);
				webViewPanel.webview.postMessage({
					type: 'fileChanged',
					uri,
					filename,
				});
			} else if (event === 'rename') {
				fs.stat(filename, (err, stat) => {
					if (!webViewPanel)
						return;
					if (!err) {
						if (!stat.isDirectory()) {
							console.log(`Post file created message, filename: ${filename}`);
							webViewPanel.webview.postMessage({
								type: 'fileCreated',
								uri,
								filename,
							});
						}
					}
				});
			}
		});
	};

	let launchTask: Promise<void> | undefined = undefined;
	let launch = async () => {
		// 检查文件夹是否存在
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('LuaSTGPlus: Working space is empty');
			return;
		}
		const workDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const distDir = path.join(workDir, 'dist');
		if (!(await existsAsync(distDir)) || !(await statAsync(distDir)).isDirectory()) {
			vscode.window.showErrorMessage('LuaSTGPlus: "dist" directory is required for launch');
			return;
		}

		// 创建 Notifier
		if (!fsWatcher)
			await createWatcher();

		// 打开 WebView 页面或者切换前端显示
		if (webViewPanel) {
			const columnToShowIn = vscode.window.activeTextEditor ?
				vscode.window.activeTextEditor.viewColumn : undefined;
			webViewPanel.reveal(columnToShowIn);
		} else {
			try {
				await createWebViewPanel();
			} catch (ex) {
				vscode.window.showErrorMessage(`LuaSTGPlus: create web view fail: ${ex}`)
				return;
			}
		}
	};

	let disposable = vscode.commands.registerCommand('luastgplus.launch', () => {
		if (!launchTask) {
			launchTask = launch();
			launchTask.finally(() => { launchTask = undefined; })
		} else {
			vscode.window.showErrorMessage(`LuaSTGPlus: launch is in progress`);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
