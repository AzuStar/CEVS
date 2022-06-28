/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileStat, FileUtils } from './fileUtils';
import { CEVSConf, DragDropEntry, Entry, TreeNode } from './cevsModel';
import { JSONUtils } from './jsonUtils';

export class CEVSExplorer implements vscode.TreeDataProvider<TreeNode>, vscode.FileSystemProvider, vscode.Disposable, vscode.TreeDragAndDropController<TreeNode> {

	// internal stuff
	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	private _onDidChangeTreeData: vscode.EventEmitter<void | null | undefined | TreeNode[]> = new vscode.EventEmitter<void | null | undefined | TreeNode[]>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode[] | undefined | void> = this._onDidChangeTreeData.event;
	private _disposables: vscode.Disposable[] = [];
	dropMimeTypes: readonly string[] = ['application/vnd.code.tree.cevscore', 'text/uri-list', 'text/plain'];
	dragMimeTypes: readonly string[] = ['application/vnd.code.tree.cevscore'];

	// kinda readonly
	private readonly _config: CEVSConf = new CEVSConf();
	private readonly _rootDir: vscode.Uri;
	private readonly _context: vscode.ExtensionContext;
	public readonly configFile: vscode.Uri;
	public readonly treeView: vscode.TreeView<TreeNode>;

	private _mappingFlag = false;

	constructor(context: vscode.ExtensionContext, rootPath: vscode.Uri) {
		this._context = context;
		this._context.subscriptions.push(this);
		this._rootDir = rootPath;
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
		this.configFile = vscode.Uri.joinPath(rootPath, ".vscode/cevs.json");
		vscode.workspace.fs.stat(this.configFile).then(null, _ => {
			this.saveCurrentConfig();
		});
		FileUtils.readfile(this.configFile.fsPath).then(buf => {
			this.populateConfig(buf);
		});
		fs.watchFile(this.configFile.fsPath, (curr, prev) => {
			FileUtils.readfile(this.configFile.fsPath).then(buf => {
				if (curr.mtime.getTime() != prev.mtime.getTime()) {
					this.populateConfig(buf);
				}
			});
		});
		this.treeView = vscode.window.createTreeView('cevsCore', {
			treeDataProvider: this,
			showCollapseAll: true,
			canSelectMany: true,
			dragAndDropController: this
		});
		this._disposables.push(this.treeView);
	}
	public async handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		let array: DragDropEntry[] = [];
		for (const node of source) {
			if (node.entry == undefined) {
				array.push(...this.iterateTreeNodeWithLocation(node, node.name));
			} else {
				array.push({ entry: node.entry, locationShard: "" });
			}
		}
		// filter unique values
		array = array.filter((item, index) => array.indexOf(item) === index);
		dataTransfer.set("application/vnd.code.tree.cevscore", new vscode.DataTransferItem(array));
	}
	public async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {

		// TODO optimize so tree doesnt need it's state updated 
		// and read, and instead it just refreshes the tree view
		const transferItem = dataTransfer.get("application/vnd.code.tree.cevscore");

		if (transferItem == undefined) return;

		const source = transferItem.value as DragDropEntry[];

		if (source.length == 0) return;

		if (target != undefined) {
			if (target.entry != undefined) {
				target = target.parent!;
			}
		}
		else {
			target = this._config.tree;
		}
		const path = vscode.Uri.parse(this.traceTreeNodeLocation(target));

		for (const entry of source) {
			entry.entry.location = vscode.Uri.joinPath(path, entry.locationShard).path;
		}
		this.saveCurrentConfig();
	}

	getParent(element: TreeNode): vscode.ProviderResult<TreeNode> | undefined {
		if (element.parent != undefined) {
			return element.parent;
		}
		return undefined;
	}

	private populateConfig(buf: Buffer): void {
		this._mappingFlag = false;
		this._config.map = {};
		const parsedJson = JSON.parse(buf.toString());
		for (const key in parsedJson) {
			this._config.map[key] = Object.assign(new Entry(), parsedJson[key]);
		}
		this._config.tree = new TreeNode();
		// for every Entry in _config.map split location as folder hierarchy
		// and save hierarchy to _config.tree specifying parent of every folder
		// and childern of every folder
		for (const key in this._config.map) {
			const entry = this._config.map[key];
			entry.uri = vscode.Uri.joinPath(this._rootDir, key);
			if (entry.location != undefined) {
				const locationUri = vscode.Uri.parse(entry.location);
				const folders = locationUri.path.split("/");
				let parent = this._config.tree;
				for (let i = 0; i < folders.length; i++) {
					if (folders[i] == "") continue;
					const folder = folders[i];
					if (parent.children[folder] == undefined) {
						parent.children[folder] = Object.assign(new TreeNode(), {
							name: folder,
							parent: parent,
						});
					} else if (parent.children[folder].entry != undefined) {
						this.reportMappingError(parent.children[folder].entry, parent.name);
					}
					parent = parent.children[folder];
				}
				if (parent.children[entry.name] == undefined) {
					parent.children[entry.name] = Object.assign(new TreeNode(), {
						name: entry.name,
						parent: parent,
						entry: entry,
					});
					entry.treeProxy = parent.children[entry.name];
				} else {
					this.reportMappingError(entry, parent.children[entry.name].name);
				}
			} else {
				if (this._config.tree.children[entry.name] == undefined) {
					this._config.tree.children[entry.name] = Object.assign(new TreeNode(), {
						name: entry.name,
						parent: this._config.tree,
						entry: entry,
					});
					entry.treeProxy = this._config.tree.children[entry.name];
				} else if (this._config.tree.children[entry.name].entry != undefined) {
					this.reportMappingError(this._config.tree.children[entry.name].entry, this._config.tree.name);
				}
			}
		}
		if (this._mappingFlag) {
			this.saveCurrentConfig();
		} else this.refresh();
	}

	public reportMappingError(entry: Entry, overlapingName: string) {
		vscode.window.showErrorMessage("Mapped file " + entry.name + " overlaps with folder " + overlapingName + ".\n" +
			"File " + entry.name + " was mapped to the root.");
		entry.location = undefined;
		this._mappingFlag = true;
	}


	//#region finilized
	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
	copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		console.error("Copy() method not supported");
	}
	async saveCurrentConfig() {
		this.writeFile(this.configFile, Buffer.from(JSON.stringify(this._config.map, null, 2), "utf-8"), { create: true, overwrite: true });
	}
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}
	public refresh() {
		this._onDidChangeTreeData.fire();
	}
	public refreshFile() {
		FileUtils.readfile(this.configFile.fsPath).then(buf => {
			this.populateConfig(buf);
		});
	}
	public renameFile(node: TreeNode) {
		const entry = node.entry;
		if (entry == undefined) {
			vscode.window.showErrorMessage("Cannot edit folder name!");
			return;
		}
		vscode.window.showInputBox({ placeHolder: entry.name, ignoreFocusOut: false, title: "Change name of file." }).then(newName => {
			if (newName == undefined) return;
			if (newName == entry.name) return;
			entry.name = newName;
			this.saveCurrentConfig();
		});
	}
	public removeFile(node: TreeNode) {
		if (node.entry == undefined) {
			const array = this.iterateTreeNode(node);
			for (const entry of array) {
				this._removeFile(entry.uri);
			}
		} else {
			this._removeFile(node.entry.uri);
		}
		this.saveCurrentConfig();
	}
	//#endregion

	//#region File Stuff
	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, FileUtils.normalizeNFC(filename.toString()));

			// TODO support excludes (using minimatch library?)

			this._onDidChangeFile.fire([{
				type: event == 'change' ? vscode.FileChangeType.Changed : await FileUtils.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: uri.with({ path: filepath })
			} as vscode.FileChangeEvent]);
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await FileUtils.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await FileUtils.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return FileUtils.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return FileUtils.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await FileUtils.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await FileUtils.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return FileUtils.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return FileUtils.rmrf(uri.fsPath);
		}

		return FileUtils.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await FileUtils.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await FileUtils.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await FileUtils.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await FileUtils.mkdir(path.dirname(newUri.fsPath));
		}

		return FileUtils.rename(oldUri.fsPath, newUri.fsPath);
	}
	//#endregion

	async addFileToCEVS(fileUri: vscode.Uri, reportExisting = true) {
		const relativeUri = vscode.workspace.asRelativePath(fileUri);
		if (this._config.map[relativeUri] != undefined) {
			if (reportExisting) {
				vscode.window.showErrorMessage("File already exists in CEVS. Revealing location...");
				this.treeView.reveal(this._config.map[relativeUri].treeProxy, { focus: true, select: false });
			}
			return;
		}
		const e: Entry = Object.assign(new Entry(), {
			name: fileUri.path.split('/').pop(),
			type: vscode.FileType.File
		});
		this._config.map[relativeUri] = e;
		await this.saveCurrentConfig();
	}

	// this will read directory recursively and get all files
	// it will then add them to the CEVS
	async addFolderToCEVS(folderUri: vscode.Uri) {
		const files = await this.readDirectory(folderUri);
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file[1] == vscode.FileType.File) {
				this.addFileToCEVS(vscode.Uri.joinPath(folderUri, file[0]), false);
			}
			else if (file[1] == vscode.FileType.Directory) {
				this.addFolderToCEVS(vscode.Uri.joinPath(folderUri, file[0]));
			}
		}
	}

	// this will find the file in CEVSConf map
	// then it will remove the file from the CEVSConf map
	private async _removeFile(fileUri: vscode.Uri) {
		const filePath = vscode.workspace.asRelativePath(fileUri);
		const entry = this._config.map[filePath];
		if (entry != undefined) {
			delete this._config.map[filePath];
		}
		await this.saveCurrentConfig();
	}

	// Iterate through tree hierarchy from a given treenode and return list of all Entries
	/**
	Location shard must be in form of "folder/folder/folder/file.ext"
	*/
	private iterateTreeNodeWithLocation(node: TreeNode, locationShard: string): DragDropEntry[] {
		const entries: DragDropEntry[] = [];
		if (node.children != undefined) {
			for (const child of Object.values(node.children)) {
				if (child.entry != undefined) {
					entries.push({ entry: child.entry, locationShard: locationShard });
				} else {
					entries.push(...this.iterateTreeNodeWithLocation(child, locationShard + "/" + child.name));
				}
			}
		}
		return entries;
	}

	private iterateTreeNode(node: TreeNode): Entry[] {
		const entries: Entry[] = [];
		if (node.children != undefined) {
			for (const child of Object.values(node.children)) {
				if (child.entry != undefined) {
					entries.push(child.entry);
				} else {
					entries.push(...this.iterateTreeNode(child));
				}
			}
		}
		return entries;

	}

	private traceTreeNodeLocation(node: TreeNode): string {
		let path: string = "";
		if (node.entry == undefined)
			path = node.name;
		while (node.parent != undefined) {
			node = node.parent;
			path = node.name + "/" + path;
		}
		return path;
	}


	// tree data provider

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (element == undefined) {
			const root = this._config.tree;
			if (root == undefined) {
				return [];
			}
			return Object.values(root.children);
		}

		return Object.values(element.children);
	}
	getTreeItem(element: TreeNode): vscode.TreeItem {
		let treeItem: vscode.TreeItem;
		const entry = element.entry;
		if (entry == undefined) {
			treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
			treeItem.iconPath = new vscode.ThemeIcon("folder");
			treeItem.contextValue = "folder";
			treeItem.tooltip = undefined;
		} else if (entry.type == vscode.FileType.File) {
			const uri = entry.uri;
			treeItem = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
			treeItem.command = { command: 'cevsCore.openFile', title: "Open File", arguments: [entry], };
			treeItem.label = entry.name;
			treeItem.contextValue = 'file';
			treeItem.tooltip = "Mapped " + uri.path;
		}
		return treeItem;
	}
}