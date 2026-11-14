# Tecla Cifra 4.8

Projeto de manutenção recuperado do APK TeclaCifra 4.7 fornecido pelo proprietário. A interface e os fluxos de importação estão em `assets/`. A camada Android, os modelos de IA e as bibliotecas nativas são preservados do APK base; este repositório não contém o código-fonte Android original.

## Correções

- Preserva as colunas da cifra original, com rolagem horizontal quando necessário.
- Lê quebras de linha e acordes marcados com `data-chord`, além de blocos PRE divididos.
- Suporta a resposta JSON pública declarada na página do Banana Cifras quando seu PRE ainda está vazio.
- Reconhece resultados móveis da pesquisa geral sem exigir um elemento H3.
- Adiciona filtros para Cifras.com.br e Banana Cifras e uma saída para a página original quando a importação não é possível.
- Limita a espera de consultas, trata erros da ponte e ignora respostas de telas anteriores.
- Processa páginas auxiliares em fila e carrega versões alternativas sem disparar vários WebViews simultâneos.
- Preserva sincronização, metadados e correções na restauração de backups novos.
- Cancela a análise de áudio ao sair da tela e valida a linha do tempo antes de montar a cifra.

## Gerar APK

Requer Java, Python 3, Apktool 2.12.1 e uber-apk-signer 1.3.0. Obtenha as ferramentas dos projetos oficiais. Os modelos e a camada Android continuam vindo do APK original.

```sh
python3 build.py --base /caminho/TeclaCifra-4.7.apk --apktool /caminho/apktool.jar --signer /caminho/uber-apk-signer.jar
```

A saída usa `com.teclacifra.fix`, versão 4.8/código 12, e instala separadamente de `com.teclacifra.app`. Os nomes completos da atividade e do serviço originais são preservados. Sem a chave original não é possível produzir uma atualização assinada compatível com a instalação 4.7. Para migrar músicas, exporte o backup na versão antiga e restaure na nova.

O assinador usa uma chave de desenvolvimento se nenhuma chave for configurada. Para distribuição definitiva, estabeleça uma chave de assinatura própria e estável.

## Verificação

```sh
npm install --prefix tests/runtime jsdom@26 --no-audit --no-fund
python3 tests/fetch_fixtures.py
node tests/regression.cjs
```

São 15 verificações de importação, alinhamento, fila, timeout, navegação, backup e eventos atrasados. Os testes de sites usam amostras baixadas durante a execução e não publicam letras no repositório. A validação do APK inclui assinatura, integridade do ZIP e comparação da camada nativa/modelos com o original. Ainda é necessário validar no aparelho Android o microfone, a memória, as redes reais e a precisão musical dos modelos. Sites podem exigir verificação ou alterar sua estrutura; o aplicativo informa falha e oferece abrir a página original nesses casos.
