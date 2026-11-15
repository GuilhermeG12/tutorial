# Análise do Vibe e melhorias no Tecla Cifra

Análise realizada em 15/11/2026 no repositório público https://github.com/thewh1teagle/vibe.

## Fluxo anterior

O APK 4.7 já possuía Whisper base multilíngue quantizado com tempos de tokens, Silero VAD, idioma português por padrão e arquivos PCM de 16 kHz. O processamento usava janelas centrais de 20 segundos, com contexto de 3 segundos em cada lado; a detecção de voz era reiniciada a cada janela. Havia uma segunda tentativa em finais de fala sem texto. As versões 4.8 e 4.8.1 preservaram esse motor.

## O que foi observado no Vibe

- `server/crates/whisper-rs/src/context.rs`: modo de tempos estáveis detecta regiões de voz, transcreve cada região e soma o deslocamento original aos tempos reconhecidos.
- `server/crates/whisper-rs/src/options.rs`: idioma, tradução, contexto, estratégia de amostragem e parâmetros de temporização são opções explícitas.
- `server/crates/vibe-server/src/audio.rs`: preparação de áudio e normalização da taxa de amostragem; há também remoção opcional de silêncio.
- O projeto é voltado a desktop. Seus controles de busca em feixe e prompts não se transferem automaticamente ao motor ONNX embarcado no Tecla Cifra, cuja implementação de Whisper usa greedy search.

## Implementação própria no Android

O novo `SpeechPipeline` mantém o detector de voz contínuo e forma janelas de até 26 segundos com 300 ms de margem. Silêncios não são removidos da linha do tempo; isso é essencial para alinhar as cifras. Trechos baixos recebem ganho limitado, sem encurtar áudio nem amplificar silêncio puro. O padding do Whisper multilíngue é explicitamente 300 frames. Uma segunda decodificação cobre finais vocais sem texto, e a junção evita duplicatas próximas no mesmo instante. Marcadores BLANKAUDIO não entram na letra. Não foram incorporados binários desktop do Vibe.

`SpeechPlan` concentra funções puras de segmentação, preparo do PCM e limpeza de marcadores. A configuração equilibrada usa o processamento legado para comparação no aparelho. O modelo de voz continua sendo o Whisper base embarcado; não houve troca silenciosa para um modelo maior.

## Verificação e limites

- 19 verificações de interface/JavaScript passaram, incluindo tema persistente, seleção de qualidade e revisão com tempos preservados.
- Testes Java verificam margens, cortes com sobreposição, preservação da duração, limites de ganho, valores finitos e remoção de marcadores.
- As assinaturas das chamadas de métodos das novas classes são verificadas contra os métodos reais no DEX recuperado.
- Um teste de inferência no computador usou os modelos do próprio APK e o arquivo público `tests/jfk.flac` do repositório OpenAI Whisper, em inglês. Na janela única, um final foi omitido; a preparação por regiões o recuperou. Em volume baixo/silêncio também surgiu um marcador BLANKAUDIO, motivo para acrescentar o filtro. Esse teste não é uma medição representativa de WER e não prova aumento universal de precisão.
- Não houve validação física em Android, corpus de canto em português, comparação com transcrição humana do usuário ou medição de consumo no Multilaser M8. Músicas com instrumentos, reverberação e coros ainda podem produzir erros. O ganho quantitativo precisa ser medido com áudios e letras de referência.
