#!/usr/bin/env bash
# Baixa as assemblies de referência da Unity (somente metadados, sem a engine) do NuGet,
# para compilar os scripts do projeto fora do Editor e pegar erros de compilação em CI.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p UnityRefs && cd UnityRefs
if [ ! -d engine ]; then
  curl -fsSL -o engine.nupkg https://api.nuget.org/v3-flatcontainer/unityengine.modules/2021.3.33/unityengine.modules.2021.3.33.nupkg
  unzip -q -o engine.nupkg -d engine && rm engine.nupkg
fi
if [ ! -d editor ]; then
  curl -fsSL -o editor.nupkg https://api.nuget.org/v3-flatcontainer/unity3d.sdk/2021.1.14.1/unity3d.sdk.2021.1.14.1.nupkg
  unzip -q -o editor.nupkg -d editor && rm editor.nupkg
fi
echo "Referências em $(pwd)"
