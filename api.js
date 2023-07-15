
let cheerio = require('cheerio');
const axios = require('axios').default;

async function getUSD() {
    let {data} = await axios.get("https://finance.yahoo.com/quote/KRW=X",{
    headers: { // 요청 헤더
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36',
      'Cache-Control': 'no-cache, no-store, must-revalidate, post-check=0, pre-check=0',
      'Pragma': 'no-cache',
      'Expires': '-1'
    }
  })

  try{
    let $ = cheerio.load(data, { decodeEntities: false });
    if ($ != undefined){
      let usd2krw =  Number($('#mrt-node-Lead-5-QuoteHeader fin-streamer:nth-child(1)').attr('value'));
      
      if(usd2krw >0){
        return usd2krw
      }
    }
  }catch(e){
    console.log(e);
  }

  return null;

}



module.exports = {
    getUSD: getUSD
}
