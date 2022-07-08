import { JSONObject } from './jsonUtils';
import { jsonIgnore, jsonReflect } from 'reflect2json';
import * as vscode from 'vscode';

export class Entry extends JSONObject {
	name: string;

	// location on disc
	// undefined for types: folder, comment
	uri: vscode.Uri | undefined;

	// undefined for types: file, comment
	children: Entry[] | undefined = [];

	@jsonIgnore()
	parent?: Entry;

	// TODO symbolic links
	type: FileType;
}

// no-multiple
export enum FileType {
	Unknow = 0,
	File = 1,
	Directory = 2,
	Comment = 3,
}

export interface DragDropEntry {
	entry: Entry;
	locationShard: string;
}

export class CEVSConf {
	map: Entry[] = [];
	entryUriMap: { [uriStr: string]: Entry } = {};
}