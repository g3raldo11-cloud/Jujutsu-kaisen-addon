# Modelos no Blender — Curupira, Saci e Boitatá

Os três heróis são **esculpidos por script** dentro do Blender: nenhum modelo, textura ou imagem
externa. Rodar `build.py` monta o modelo, o esqueleto, os materiais e o cenário; renderiza e exporta
o `.glb` usado pelo jogo (Godot) e pelo Hero Select (web).

## Polígonos

Contagem das malhas dos personagens (efeitos e cenário não entram na conta):

| Herói | Faces no Blender | Triângulos | `.glb` de jogo (`assets/models`) |
|---|---|---|---|
| Curupira | ~707 mil | ~1,42 milhão | ~234 mil faces · 10 MB |
| Saci | ~598 mil | ~1,2 milhão | ~233 mil faces · 8 MB |
| Boitatá (enrolado, render) | ~744 mil | ~1,49 milhão | ~225 mil faces · 8 MB (corpo reto, com 28 ossos) |

Os renders e o arquivo do Blender usam a resolução cheia. O `.glb` que vai para o jogo é
**dizimado** para não pesar no repositório nem no jogo (o Godot ainda gera níveis de detalhe ao
importar). Para exportar o `.glb` na resolução cheia use `--faces 0`.

## Como usar

Precisa do **Blender 4.0 ou mais novo** (o Blender oficial já traz o `numpy`; a exportação usa também
o `scipy`, que o Blender oficial não traz: instale com `pip` no Python do Blender, se for exportar).

```bash
blender -b -P build.py -- --hero all --export ../assets/models
```

```bash
blender -b -P build.py -- --hero curupira --render retrato,beauty,argila --samples 64
```

```bash
blender -P build.py -- --hero saci
```

O último comando abre o Blender com a cena montada, para olhar e mexer à vontade.

## Render realista (Cycles)

No Blender 4.2 ou mais novo o render é feito no **Cycles** (traçado de caminhos): luz global, sombras
de verdade, subsuperfície na pele, volumes e redução de ruído **OIDN**, com amostragem adaptativa e cor
**Filmic**. Também roda sem interface com o módulo `bpy` do PyPI (foi assim que os renders foram
feitos, num servidor só com CPU):

```bash
pip install bpy scipy numba
```

```bash
python build.py -- --hero curupira --render retrato,close --samples 160
```

```bash
blender -b -P build.py -- --hero saci --render retrato --engine cycles --samples 160
```

Opções do Cycles: `--engine eevee|cycles`, `--threshold` (ruído aceito na amostragem adaptativa),
`--view`/`--look` (transformação de cor), `--percent 50` (teste rápido em meia resolução) e `--exr`
(grava também um `.exr` linear para ajustar exposição e cor sem renderizar de novo).

O que a versão realista acrescenta:

- **Fogo simulado** (`fogo.py`): o simulador do Blender (Mantaflow) não funciona nas versões usadas,
  então o fogo é simulado por um solver próprio — fluido em grade com advecção BFECC, empuxo pelo
  calor, confinamento de vorticidade, turbulência, combustão (combustível → calor, chama e fuligem) e
  projeção de pressão exata por transformada de cosseno. O resultado é gravado em **OpenVDB** e o
  Cycles renderiza como volume. Com `numba` instalado a simulação fica ~4x mais rápida. O mesmo solver
  faz a fumaça do cachimbo, o redemoinho de poeira e o vapor da perna de vento do Saci.
- **Mata e cerrado** (`mata.py`): milhares de folhas secas curvadas no chão, samambaias com folíolos,
  arvoretas, gravetos, copa que recorta a luz da lua (chão salpicado e fachos na névoa), casca de árvore
  com fissuras e liquens; no cerrado, capim fio a fio, cupinzeiros, árvores tortas com folhas e céu
  físico de pôr do sol.
- **Pelos e olhos** (`pelos.py`): cabelo crespo do Saci, sobrancelhas e cílios como curvas renderizadas
  fio a fio (modelo de fibra com melanina); olhos com esclera, íris acesa, pupila e córnea molhada.
- **Pele**: subsuperfície com o alcance da pele de verdade, palmas e solas mais claras, lábios mais
  escuros e úmidos, poros.
- A névoa fica numa caixa de volume (no Cycles o volume do "mundo" é infinito e apagaria a luz da lua).

Opções principais: `--hero curupira|saci|boitata|all`, `--render retrato,beauty,close,argila,preview`,
`--export pasta`, `--faces N` (faces do `.glb`; 0 = resolução cheia), `--samples`, `--res 1920x1080`,
`--save pasta` (salva o `.blend`), `--nofx` (sem efeitos), `--estilo mecanico` (versão de armadura,
alternativa).

## Como a escultura é feita (`lendas3d/`)

- `anatomy.py` — anatomia masculina estilizada em pose em A: dezenas de **massas musculares**
  (peitorais, deltoides, bíceps, abdômen, oblíquos, glúteos, quadríceps, panturrilhas...) como
  metaballs, mais **traços de tamanho exato** (nariz, lábios, pálpebras, arcos das sobrancelhas, orelhas,
  dedos das mãos e dos pés) e **pincéis de vinco** (linha alba, gomos do abdômen, borda do peitoral,
  cinto de Adônis, sulco nasolabial).
- `sculpt.py` — poligoniza as metaballs, **une todas as peças num remesh voxel** (como o DynaMesh do
  ZBrush), suaviza e aplica os detalhes: rachaduras tipo Voronoi afundadas na pele (com largura
  variável, trechos interrompidos e placas com alturas diferentes), ruído de pele, vincos e volumes.
- `rig.py` — esqueleto e pesos: "bone heat" numa cópia simplificada, transferido para a malha cheia;
  onde o bone heat falha (partes finas), pesos pela distância aos ossos.
- `org.py` — materiais (pele com subsuperfície e brasas, fibra, tecido, madeira, pedra, fogo) e peças
  (fibras, cordas trançadas, amarrações, lança, olhos) e os cenários **mata** e **cerrado**.
- `curupira.py`, `saci.py`, `boitata.py` — cada herói; `humano.py` reúne o que Curupira e Saci têm em
  comum (esqueleto, âncoras de efeito, poses, vista em argila).
- `fx.py`, `stage.py` — fogo volumétrico procedural, línguas de fogo, faíscas, brasas, fumaça, fitas de
  vento, luzes, névoa, céu e câmera (render EEVEE ou Cycles).
- `fogo.py`, `mata.py`, `pelos.py` — simulação de fogo/fumaça (OpenVDB), vegetação em lote e pelos/olhos
  (ver "Render realista").
- `mec_*.py`, `parts.py` — a versão mecanizada (armaduras), mantida como alternativa.

## O que cada modelo traz

- **Curupira**: corpo atlético, pele escura com placas queimadas e rachaduras de brasa que brilham
  (no jogo brilham mais com o Calor), olhos de fogo, orelhas pontudas, cabeleira de mechas em chamas,
  **pés virados para trás**, saia de fibras em camadas e tufos, cinto de corda trançada, colar de dentes
  e sementes, amarrações nos pulsos e tornozelos, lança de pedra lascada com penas.
- **Saci**: jovem magro e atlético de **uma perna só** (no lugar da outra, uma perna fantasma de vento),
  carapuça vermelha comprida voando ao vento, calção rasgado com a perna vazia, faixa na cintura,
  lenço no pescoço, cachimbo de barro com brasa na mão, tornozeleira de contas, olhos que brilham.
- **Boitatá**: serpente com milhares de escamas em geometria (bordas em brasa), ventre em placas,
  cabeça de dragão com chifres para trás, boca aberta com presas e língua bifurcada, e **olhos de fogo
  ao longo do corpo**.

## No jogo e na web

O `.glb` traz o esqueleto, os pesos e vazios-âncora `FX_*` (cabelo, mãos, pés, cachimbo, perna de
vento, boca, cauda...). No Godot, as juntas procedurais de cada herói continuam calculando a animação e
agora giram os ossos do modelo; no Boitatá, a corrente de ossos segue o corpo simulado. Os dados de
brasa/borda vão no mapa UV e viram brilho nos shaders (`scripts/game/l_org_shaders.gd` e
`hero-select/src/characters/sculpted.js`).

## Limites (para ser honesto)

É escultura **procedural**: proporções, músculos e rostos são estilizados e calculados, não uma
escultura feita à mão num ZBrush. O fogo é uma simulação simplificada (sem domínio adaptativo nem
partículas), feita para imagens paradas; e o render realista na CPU é lento (vários minutos por imagem). As mãos têm dedos separados mas não seguram objetos de verdade
(a lança atravessa a mão). As referências enviadas serviram de guia de estilo e de traços das lendas;
nada foi copiado delas.
