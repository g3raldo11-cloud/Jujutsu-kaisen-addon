#!/usr/bin/env python3
"""Gera dist/NoiteMaldita.rbxlx a partir de src/ (sem precisar do Rojo).

O arquivo .rbxlx abre direto no Roblox Studio (Arquivo > Abrir do arquivo).
Segue as mesmas regras do Rojo para nomes de arquivos:

  pasta com init.server.luau  -> Script
  pasta com init.client.luau  -> LocalScript
  pasta com init.luau         -> ModuleScript
  outra pasta                 -> Folder
  nome.server.luau            -> Script
  nome.client.luau            -> LocalScript
  nome.luau                   -> ModuleScript

Uso:  python3 tools/build_place.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "default.project.json"
OUTPUT = ROOT / "dist" / "NoiteMaldita.rbxlx"

_referent = 0


def next_ref() -> str:
    global _referent
    _referent += 1
    return f"RBX{_referent:08X}"


def cdata(text: str) -> str:
    return "<![CDATA[" + text.replace("]]>", "]]]]><![CDATA[>") + "]]>"


class Node:
    def __init__(self, class_name: str, name: str, source: str | None = None):
        self.class_name = class_name
        self.name = name
        self.source = source
        self.children: list[Node] = []

    def to_xml(self, indent: int) -> str:
        pad = "\t" * indent
        lines = [f'{pad}<Item class="{self.class_name}" referent="{next_ref()}">']
        lines.append(f"{pad}\t<Properties>")
        lines.append(f'{pad}\t\t<string name="Name">{escape(self.name)}</string>')
        if self.source is not None:
            lines.append(f'{pad}\t\t<ProtectedString name="Source">{cdata(self.source)}</ProtectedString>')
        lines.append(f"{pad}\t</Properties>")
        for child in sorted(self.children, key=lambda n: n.name):
            lines.append(child.to_xml(indent + 1))
        lines.append(f"{pad}</Item>")
        return "\n".join(lines)


SCRIPT_SUFFIXES = [
    (".server.luau", "Script"),
    (".client.luau", "LocalScript"),
    (".server.lua", "Script"),
    (".client.lua", "LocalScript"),
    (".luau", "ModuleScript"),
    (".lua", "ModuleScript"),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def from_file(path: Path) -> Node | None:
    for suffix, class_name in SCRIPT_SUFFIXES:
        if path.name.endswith(suffix):
            return Node(class_name, path.name[: -len(suffix)], read(path))
    return None


def from_directory(path: Path, name: str) -> Node:
    init_class = None
    init_file = None
    for candidate, class_name in [
        ("init.server.luau", "Script"),
        ("init.client.luau", "LocalScript"),
        ("init.luau", "ModuleScript"),
        ("init.server.lua", "Script"),
        ("init.client.lua", "LocalScript"),
        ("init.lua", "ModuleScript"),
    ]:
        if (path / candidate).is_file():
            init_class, init_file = class_name, path / candidate
            break

    node = Node(init_class or "Folder", name, read(init_file) if init_file else None)
    for child in sorted(path.iterdir()):
        if child == init_file or child.name.startswith("."):
            continue
        if child.is_dir():
            node.children.append(from_directory(child, child.name))
        else:
            child_node = from_file(child)
            if child_node:
                node.children.append(child_node)
    return node


def from_project(name: str, tree: dict) -> Node:
    if "$path" in tree:
        path = ROOT / tree["$path"]
        node = from_directory(path, name) if path.is_dir() else from_file(path)
        if node is None:
            raise SystemExit(f"Caminho inválido: {path}")
        node.name = name
    else:
        node = Node(tree.get("$className", name), name)
    for key, value in tree.items():
        if not key.startswith("$"):
            node.children.append(from_project(key, value))
    return node


def main() -> int:
    project = json.loads(read(PROJECT))
    tree = project["tree"]
    services = [from_project(key, value) for key, value in tree.items() if not key.startswith("$")]

    body = "\n".join(service.to_xml(1) for service in services)
    xml = (
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n'
        f"{body}\n</roblox>\n"
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(xml, encoding="utf-8")

    scripts = xml.count('name="Source"')
    print(f"Gerado {OUTPUT.relative_to(ROOT)} ({scripts} scripts, {len(xml) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
