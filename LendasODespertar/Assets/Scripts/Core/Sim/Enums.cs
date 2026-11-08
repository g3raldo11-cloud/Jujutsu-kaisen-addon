namespace Lendas.Core
{
    /// <summary>As duas forças que disputam os Núcleos de Memória.</summary>
    public enum Team { None = -1, Aurora = 0, Crepusculo = 1 }

    /// <summary>Etapas do Ciclo das Lendas.</summary>
    public enum MatchPhase { Despertar, Ressonancia, Manifestacao, Encerrada }

    /// <summary>Teclas de ação de um comando de jogador.</summary>
    public enum AbilitySlot { Basico = 0, Habilidade1 = 1, Habilidade2 = 2, Habilidade3 = 3, Suprema = 4 }

    public enum CharacterId
    {
        SaciPerere,
        Boitata,
        Curupira,
    }

    public enum StatusType
    {
        /// <summary>Reduz a velocidade (Magnitude = fração 0..1).</summary>
        Lentidao,
        /// <summary>Impede movimento, mas permite habilidades.</summary>
        Enraizado,
        /// <summary>Atordoado: interrompe canalizações, impede ações.</summary>
        Atordoado,
        /// <summary>Escudo que absorve dano (Magnitude = pontos de escudo restantes).</summary>
        Escudo,
        /// <summary>Visão reduzida e ataques básicos falham (Olhar Incandescente).</summary>
        Ofuscado,
        /// <summary>Movimento sofre deriva na direção do vento (Vento Travesso).</summary>
        Ventania,
        /// <summary>Aumento de velocidade (Magnitude = fração).</summary>
        Pressa,
        /// <summary>Dano contínuo (Magnitude = dano por segundo).</summary>
        Queimadura,
        /// <summary>Imune a efeitos de controle.</summary>
        Imparavel,
    }

    public enum ZoneKind
    {
        RastroDeFogo,
        ReinoDosRedemoinhos,
        RedemoinhoAncora,
        TempestadeDeBrasas,
        PegadaIncandescente,
        CirculoDeFogo,
        IraDoCurupira,
    }

    public enum TerrainKind { Solo, Agua, Vegetacao }
}
