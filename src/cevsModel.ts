import { JSONObject } from './jsonUtils';
import { jsonIgnore, jsonReflect } from 'reflect2json';
import * as vscode from 'vscode';

export class TreeNode extends JSONObject {
	name: string = '';
	// serialization cannot be looped, so parent has to be ignored
	@jsonIgnore()
	parent?: TreeNode;
	children: { [name: string]: TreeNode } = {};
	entry?: Entry;
}

export class Entry extends JSONObject {
	name: string;
	location: string | undefined;

	@jsonIgnore()
	uri: vscode.Uri;

	@jsonIgnore()
	treeProxy: TreeNode;

	// TODO symbolic links
	type: vscode.FileType;
}

export interface DragDropEntry {
	entry: Entry;
	locationShard: string;
}

export class CEVSConf {
	map: { [uriStr: string]: Entry } = {};
	tree: TreeNode = new TreeNode();
}