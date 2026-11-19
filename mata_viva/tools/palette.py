# Palette of the Pixelwright project "Mata Viva" (prj_45044a50789cbd4b)
PAL = {
 "outline":"#120c18",
 "leaf.0":"#0e2620","leaf.1":"#18402c","leaf.2":"#24613a","leaf.3":"#3f8a3c","leaf.4":"#7cbf45","leaf.5":"#c4ec6a",
 "teal.0":"#0b171c","teal.1":"#10252a","teal.2":"#183632","teal.3":"#24493d",
 "earth.0":"#1f1512","earth.1":"#3b261b","earth.2":"#5c3b24","earth.3":"#86592f","earth.4":"#b5853f",
 "stone.0":"#241619","stone.1":"#432829","stone.2":"#6a3e33","stone.3":"#955a41","stone.4":"#c08055",
 "rock.0":"#1c1d24","rock.1":"#2f313b","rock.2":"#4a4c57","rock.3":"#6d6f78","rock.4":"#9a9ba0",
 "skin.0":"#2e1712","skin.1":"#5a2c1c","skin.2":"#8b4a2c","skin.3":"#b9703f","skin.4":"#dc9a62",
 "pale.0":"#3a1e1c","pale.1":"#6e3e32","pale.2":"#a86a52","pale.3":"#d79a78",
 "red.0":"#2c0b12","red.1":"#5a1218","red.2":"#921c1e","red.3":"#c8321f","red.4":"#ec5a35",
 "gold.0":"#4a2a0e","gold.1":"#8a5414","gold.2":"#c88a1e","gold.3":"#f0c040","gold.4":"#fff0a0",
 "blue.0":"#121a3a","blue.1":"#1c3a7a","blue.2":"#2a64b8","blue.3":"#4f9be0","blue.4":"#a6dcf6",
 "fire.0":"#3e0a0c","fire.1":"#86140e","fire.2":"#d23410","fire.3":"#ff7a1a","fire.4":"#ffbe3c","fire.5":"#fff4c0",
 "magic.0":"#08302a","magic.1":"#10663c","magic.2":"#2fb04a","magic.3":"#8cf05a","magic.4":"#e4ffc0",
 "leather.0":"#1a100e","leather.1":"#34201a","leather.2":"#563424","leather.3":"#7e5032","leather.4":"#a8743e",
 "metal.0":"#1e1c26","metal.1":"#3c3c4c","metal.2":"#6e7284","metal.3":"#a9b0bc","metal.4":"#e8eef2",
 "ash.0":"#221c22","ash.1":"#3c3238","ash.2":"#5e5258","ash.3":"#8a7e82","ash.4":"#b8aeae",
 "cream.0":"#6e6252","cream.1":"#a8987a","cream.2":"#d8c9a4","cream.3":"#f6eeda",
}
def hex2rgb(h):
    h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
