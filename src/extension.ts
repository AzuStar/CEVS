'use strict';

import * as vscode from 'vscode';

import { CEVSExplorer } from './cevsCore';
import { Entry, TreeNode } from './cevsModel';
// import { TestViewDragAndDrop } from './testViewDragAndDrop';

export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri : undefined;

	// Samples of `window.registerTreeDataProvider`
	const cevsExplorer = new CEVSExplorer(context, rootPath);

vscode.commands.registerCommand('cevsCore.openFile', (resource: Entry) => {
	// check if file exists, if not call fileRemoved in cevsProvider
	vscode.workspace.fs.stat(resource.uri).then(_ => {
		// if resource is open, open it in the editor, else preview it
		if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath === resource.uri.fsPath) {
			vscode.window.showTextDocument(vscode.window.activeTextEditor.document, { preview: false });
		}
		else {
			vscode.window.showTextDocument(resource.uri, { preview: true });
		}
	}, _ => {
		cevsExplorer.removeFile(resource.treeProxy);
	});

});

// cevsEdit.editEntry
// vscode.commands.registerCommand('cevsCore.editEntry', (resource) => {
vscode.commands.registerCommand('cevsCore.addFiles', (uri: vscode.Uri) => cevsExplorer.addFileToCEVS(uri));
vscode.commands.registerCommand('cevsCore.addFolder', (uri: vscode.Uri) => cevsExplorer.addFolderToCEVS(uri));
vscode.commands.registerCommand('cevsCore.refresh', () => cevsExplorer.refreshFile());
vscode.commands.registerCommand('cevsCore.renameFile', (node: TreeNode) => cevsExplorer.renameFile(node));
vscode.commands.registerCommand('cevsCore.removeFile', (node: TreeNode) => cevsExplorer.removeFile(node));
	// vscode.commands.registerCommand('extension.openPackageOnNpm', moduleName => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)));

	// vscode.commands.registerCommand('cevsCore.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`));
	// vscode.commands.registerCommand('cevsCore.editEntry', (node: CItem) => vscode.window.showInformationMessage(`Successfully called edit entry on ${node.label}.`));
	// vscode.commands.registerCommand('cevsCore.deleteEntry', (node: CItem) => vscode.window.showInformationMessage(`Successfully called delete entry on ${node.label}.`));

	// // Samples of `window.createView`

	// // Test View
	// new TestView(context);

	// new TestViewDragAndDrop(context);
}