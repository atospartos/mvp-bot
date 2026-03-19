// Список отслеживаемых токенов с маппингом между DEX и CEX
module.exports = [
    // {
    //     symbol: 'USDC',
        
    //     // DEX данные (DexScreener)
    //     dex: {
    //         solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    //         ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    //         bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
    //     },
        
    //     // CEX данные (CCXT)
    //     cex: {
    //         mexc: 'USDC/USDT',
    //         gateio: 'USDC/USDT'
    //     }
    // },

    {
        symbol: 'PIPPIN',
        dex: {
            solana: 'Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump'
        },
        cex: {
            mexc: 'PIPPIN/USDT',
            gateio: 'PIPPIN/USDT'
        }
    },

    {
        symbol: 'USELESS',
        dex: {
            solana: 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk'
        },
        cex: {
            mexc: 'USELESS/USDT',
            gateio: 'USELESS/USDT'
        }
    }
    

];