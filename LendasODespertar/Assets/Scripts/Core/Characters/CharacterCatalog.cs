using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Catálogo de entidades jogáveis implementadas. O jogo final terá exatamente 15 entidades;
    /// esta etapa implementa Saci-Pererê, Boitatá e Curupira (versão de fogo) por completo.
    /// As outras 13 constam no documento de design (Docs/Personagens.md) e só entram no catálogo
    /// quando suas habilidades estiverem funcionais.
    /// </summary>
    public static class CharacterCatalog
    {
        private static readonly Dictionary<CharacterId, Func<CharacterStats>> Factories = new Dictionary<CharacterId, Func<CharacterStats>>
        {
            { CharacterId.SaciPerere, SaciKit.CreateStats },
            { CharacterId.Boitata, BoitataKit.CreateStats },
            { CharacterId.Curupira, CurupiraKit.CreateStats },
        };

        public static IEnumerable<CharacterId> Implemented => Factories.Keys;

        public static CharacterStats CreateStats(CharacterId id) => Factories[id]();

        public static ChampionKit CreateKit(CharacterId id)
        {
            switch (id)
            {
                case CharacterId.SaciPerere: return new SaciKit();
                case CharacterId.Boitata: return new BoitataKit();
                case CharacterId.Curupira: return new CurupiraKit();
                default: throw new ArgumentOutOfRangeException(nameof(id), id, "Entidade ainda não implementada");
            }
        }
    }
}
