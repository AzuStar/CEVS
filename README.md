# CEVS - Custom Editor for VScode

This extension lets user organize folders/files how they see fit.
I, personally, prefer to keep managed files in specific order and have certain directory structure too.
For now, this extension is not a replacement of explorer, but rather an addition.

What CEVS can do:
- Add files from explorer to CEVS by right-click->Add Files/Folder to CEVS.
- Move folders/files around.
- Autoupdates structure when CEVS config is updated.
- Rename files, this will only change name in CEVS, not an actual file name. (looks ugly, but cant do anything about it)
- Delete files/folders from CEVS.

What CEVS cannot do yet:
- Add folder keeping original folder structure.
- Cannot drop files/folder from explorer into CEVS.
- Autoupdate instantly. Current watch timer is about a second.
- Order can only be specified manually in .vscode/cevs.json file.

PS was probably a bad idea to use treeview in the first place, but for first version it will suffice.