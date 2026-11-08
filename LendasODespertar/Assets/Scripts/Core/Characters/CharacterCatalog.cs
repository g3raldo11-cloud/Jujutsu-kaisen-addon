using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Catálogo de entidades jogáveis implementadas. O jogo final terá exatamente 15 entidades;
    /// esta etapa (Etapa 2 — Protótipo) implementa Saci-Pererê e Boitatá por completo.
    /// As outras 13 constam no documento de design (Docs/Personagens.md) e só entram no catálogo
    /// quando suas habilidades estiverem funcionais.
    /// </summary>
    public static class CharacterCatalog
    {
        private static readonly Dictionary<CharacterId, Func<CharacterStats>> Factories = new Dictionary<CharacterId, Func<CharacterStats>>
        {
            { CharacterId.SaciPerere, SaciKit.CreateStats },
            { CharacterId.Boitata, BoitataKit.CreateStats },
        };

        public static IEnumerable<CharacterId> Implemented => Factories.Keys;

        public static CharacterStats CreateStats(CharacterId id) => Factories[id]();

        public static ChampionKit CreateKit(CharacterId id)
        {
            switch (id)
            {
                case CharacterId.SaciPerere: return new SaciKit();
                case CharacterId.Boitata: return new BoitataKit();
                default: throw new ArgumentOutOfRangeException(nameof(id), id, "Entidade ainda não implementada");
            }
        }
    }
}
