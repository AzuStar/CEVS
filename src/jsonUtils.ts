import { jsonReflect } from "reflect2json";

@jsonReflect()
export class JSONObject {
	private readonly __class = true;
}

export class JSONUtils {
	public static deserializeRecursive(objLock: object, json: object): object {
		if (objLock == undefined) { // merge non existing keys
			objLock = json;
			return objLock;
		}
		for (const prop in json) {
			if (typeof json[prop] == 'object') {
				objLock[prop] = this.deserializeRecursive(objLock[prop], json[prop]);
			} else if (typeof objLock[prop] == typeof json[prop]) {
				objLock[prop] = json[prop];
			}
		}
		return objLock;
	}
}