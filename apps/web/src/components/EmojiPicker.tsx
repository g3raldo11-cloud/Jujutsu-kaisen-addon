import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fileUrl } from '../lib/api';
import { useStore } from '../lib/store';
import { cx } from '../lib/format';

const GROUPS: { name: string; icon: string; list: string }[] = [
  { name: 'Frequentes', icon: '🕘', list: '👍 ❤️ 😂 🔥 🎉 👀 🙏 😮 😢 💯 ✅ 👏' },
  { name: 'Rostos', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖' },
  { name: 'Gestos', icon: '👋', list: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🧠 👀 👁️ 👅 👄' },
  { name: 'Símbolos', icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🕳️ 💬 💭 💤 ✅ ❌ ⭕ ❗ ❓ ⚠️ 🔞 ♻️ ✨ ⭐ 🌟 🔥 ⚡ 🎯 🔔 🔕 🎵 🎶 ➕ ➖ ✖️ ♾️' },
  { name: 'Natureza', icon: '🌿', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦉 🦄 🐝 🦋 🐢 🐍 🐙 🦈 🐳 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌸 🌹 🌻 🌼 🌙 🌞 ⛅ 🌧️ ⛈️ ❄️ 🌈 🌊' },
  { name: 'Comida', icon: '🍕', list: '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌽 🥕 🥔 🍞 🧀 🥚 🍳 🥓 🍔 🍟 🍕 🌭 🌮 🌯 🍣 🍜 🍝 🍦 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷' },
  { name: 'Atividades', icon: '⚽', list: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎮 🕹️ 🎲 ♟️ 🧩 🎯 🎳 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎻 🏆 🥇 🥈 🥉 🎖️ 🎟️ 🎪' },
  { name: 'Objetos', icon: '💡', list: '💻 🖥️ ⌨️ 🖱️ 📱 📷 🎥 📺 📻 ⏰ ⌛ 💡 🔦 📚 📖 📝 ✏️ 📌 📎 🔒 🔓 🔑 🗝️ 🔨 🛠️ ⚙️ 🧪 🔭 💊 💉 🧲 💰 💳 ✉️ 📦 🎁 🎈 🏠 🚀 ✈️ 🚗 🚲 ⛺ 🗺️ 🧭' },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(0);
  const custom = useStore((s) => s.emojis.filter((e) => e.kind === 'emoji'));
  const filteredCustom = useMemo(() => custom.filter((e) => !q || e.name.includes(q.toLowerCase())), [custom, q]);
  const list = q ? [] : GROUPS[group].list.split(' ');
  return (
    <div className="w-[320px] p-2">
      <div className="relative mb-2">
        <Search className="absolute top-2.5 left-2.5 size-4 text-faint" />
        <input autoFocus className="field !py-1.5 pl-8 text-[14px]" placeholder="Buscar emoji personalizado" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!q && (
        <div className="mb-1 flex gap-0.5">
          {GROUPS.map((g, i) => (
            <button key={g.name} title={g.name} onClick={() => setGroup(i)} className={cx('flex-1 rounded-md py-1 text-[17px]', i === group ? 'bg-accent-soft' : 'hover:bg-hover')}>
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div className="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto">
        {filteredCustom.map((e) => (
          <button key={e.id} title={`:${e.name}:`} onClick={() => onPick(`:${e.name}:`)} className="flex aspect-square items-center justify-center rounded-md hover:bg-hover">
            <img src={fileUrl(e.fileId)} alt={e.name} className="size-6 object-contain" />
          </button>
        ))}
        {list.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="flex aspect-square items-center justify-center rounded-md text-[22px] hover:bg-hover">
            {e}
          </button>
        ))}
      </div>
      {q && !filteredCustom.length && <p className="px-2 py-4 text-center text-[13px] text-muted">Nenhum emoji com esse nome.</p>}
    </div>
  );
}
