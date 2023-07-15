const ccxt = require('ccxt');
const axios = require('axios').default;
const upbitExchange = new ccxt.upbit();
const bithumbExchange = new ccxt.bithumb();
const binanceExchange = new ccxt.binance();
const ReconnectingWebSocket = require('reconnecting-websocket');
const WebSocket = require('ws');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
let colors = require('colors/safe')
let { getUSD } = require('./api.js');
let moment = require('moment');
require('moment-timezone');
moment.tz.setDefault("Asia/Seoul");
const EVENT_NOTI_TIME = 15000;
let  event_volume_ = 50000000;
let event_log_save_timeout_ = 5;
let collection_time_ = 60;
let filter_market_ = 1; // 1. 전체 ,2 KRW , 3.BTC



const EXCHANGE_UPBIT = "upbit"
const EXCHANGE_BITHUMB = "bithumb";
const EXCHANGE_BINANCE = "binance";
const INTERVAL_TIME = 100;

const TYPE_TICKER = 1;
const TYPE_TRADE =2;

const TYPE_BID = 1;
const TYPE_ASK = 2;


let exchange = EXCHANGE_UPBIT;

/** 누적 시간(분) 설정 **/
// 최근 비트코인 가격
let latest_btc_krw_price= null;
// 비트코인 변동률 알림을 위한 초기값 저장
let init_btc_price= null;
// 전일대비 비트코인 변동률 값 저장
let btc_krw_daybefore = null;

// 해외 거래소 원화환산을 위해 필요
let USD2KRW = null;

function getTime(time) {
  return moment.unix(time / 1000).format('YYYY.MM.DD HH:mm:ss');
  //return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss");
}

function getHHmmss() {
  return moment(Date.now()).format('HH:mm:ss');
  //return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss");
}

function getHHmm(time_key) {
  return moment.unix(time_key / 1000).format('HH:mm');
  //return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss");
}

async function initMarketInfo(cctx_ ,includesQuote, bucket){
  //const exchangeId = cctx_.id; // upbit, bithumb

  await cctx_.loadMarkets(); // 마켓 정보 로드
  for (const key in cctx_.markets) {
    const market = cctx_.markets[key];

    if(market.active == false){
      continue;
    }
   
    //console.log(market);
    //info: { market: 'KRW-CHZ', korean_name: '칠리즈', english_name: 'Chiliz' },
   
    //let symbol = market.symbol; // LOOM/BTC' , symbol
    let base = market.base; // BTC , symbol
    let quote = market.quote; // KRW

    if(( base && quote ) && includesQuote.includes(quote)){
      let market_info = {
        base : base,
        quote : quote
      }
      
      switch(exchange){
        case EXCHANGE_UPBIT:
        case EXCHANGE_BITHUMB:
          switch(quote){
            case "KRW": // 원화마켓이 가장 높은 우선순위를 가진다.
              bucket[base] = market_info
              break;
            case "BTC":
              if(cctx_.markets[`${base}/KRW`] == null){ // 원화 마켓 코인이 없는 경우에만 추가
                bucket[base] = market_info
              }
              break;
          } 
          break; 
        case EXCHANGE_BINANCE:
          switch(quote){
            case "USDT": // USDT 마켓이 가장 높은 우선순위를 가진다.
              bucket[base] = market_info
              break;
            case "BUSD":
              if(cctx_.markets[`${base}/USDT`] == null){ // 원화 마켓 코인이 없는 경우에만 추가
                bucket[base] = market_info
              }
              break;
            case "BTC":
              if(cctx_.markets[`${base}/USDT`] == null && cctx_.markets[`${base}/BUSD`] == null){ // 원화 마켓 코인이 없는 경우에만 추가
                bucket[base] = market_info
              }
              break;
          }
          break;
      }
     
    }
  }

  //console.log(bucket);
}


function connectWebsocket(exchange, bucket){

  const extractBaseQuote = (symbol) => {
    const baseQuoteRegex = /([A-Z0-9]+)(USDT|BTC|BUSD)/;
    const matches = symbol.match(baseQuoteRegex);
  
    if (matches) {
      const base = matches[1];
      const quote = matches[2];
  
      return {
        base,
        quote
      };
    }
  
    return null;
  }

  const parseCommonObj = (exchange, data) =>{
    //console.log(data);
    if(data?.type == "ticker" || data?.e =="24hrTicker"){
      switch(exchange){
        case EXCHANGE_UPBIT:
          return [
            {
              type : TYPE_TICKER,
              market : data.code,
              base : data.code.split("-")[1],
              quote : data.code.split("-")[0],
              price : data.trade_price,
              high : data.high_price,
              low : data.low_price ,
              prev_price : data.prev_closing_price
            }
          ];

              // {
              //   type: 'ticker',
              //   code: 'KRW-BTC',
              //   opening_price: 40610000,
              //   high_price: 40775000,
              //   low_price: 39801000,
              //   trade_price: 40120000,
              //   prev_closing_price: 40610000,
              //   acc_trade_price: 121252190991.84348,
              //   change: 'FALL',
              //   timestamp: 1688569635480,
              //   acc_trade_price_24h: 153503385930.03625,
              //   acc_trade_volume_24h: 3801.58811657,
              //   stream_type: 'REALTIME'
              // }
              // if(code == "KRW-BTC"){
              //   console.log(data);
              // }
        case EXCHANGE_BITHUMB:
          return [
            {
              type : TYPE_TICKER,
              market : data.content.symbol,
              base : data.content.symbol.split("_")[0],
              quote : data.content.symbol.split("_")[1],
              price : data.content.closePrice,
              high : data.content.highPrice,
              low : data.content.lowPrice ,
              prev_price : data.content.prevClosePrice
            }
          ]

               //   {
        //     "type" : "ticker",
        //     "content" : {
        //         "symbol" : "BTC_KRW",           // 통화코드
        //         "tickType" : "24H",                 // 변동 기준시간- 30M, 1H, 12H, 24H, MID
        //         "date" : "20200129",                // 일자
        //         "time" : "121844",                  // 시간
        //         "openPrice" : "2302",               // 시가
        //         "closePrice" : "2317",              // 종가
        //         "lowPrice" : "2272",                // 저가
        //         "highPrice" : "2344",               // 고가
        //         "value" : "2831915078.07065789",    // 누적거래금액
        //         "volume" : "1222314.51355788",  // 누적거래량
        //         "sellVolume" : "760129.34079004",   // 매도누적거래량
        //         "buyVolume" : "462185.17276784",    // 매수누적거래량
        //         "prevClosePrice" : "2326",          // 전일종가
        //         "chgRate" : "0.65",                 // 변동률
        //         "chgAmt" : "15",                    // 변동금액
        //         "volumePower" : "60.80"         // 체결강도
        //     }
        // }

        case EXCHANGE_BINANCE:
          let baseQuote = extractBaseQuote(data.s);

          return [
            {
              type : TYPE_TICKER,
              market : data.s,
              base : baseQuote.base,
              quote : baseQuote.quote,
              price : data.c,
              high : data.h,
              low : data.l ,
              prev_price : data.x
            }
          ]
          // {
          //   "e": "24hrTicker",         // 이벤트 타입 (Event Type): 24시간 티커 이벤트
          //   "E": 1689394086956,       // 이벤트 시간 (Event Time): 타임스탬프 (밀리초 단위)
          //   "s": "KAVAUSDT",           // 심볼 (Symbol): 가상화폐 심볼
          //   "p": "-0.03600000",       // 가격 변동 (Price Change)
          //   "P": "-3.738",            // 가격 변동률 (Price Change Percentage)
          //   "w": "0.95000234",        // 평균 가격 (Weighted Average Price)
          //   "x": "0.96300000",        // 이전 거래의 가격 (Previous Day's Close Price)
          //   "c": "0.92700000",        // 현재 가격 (Current Day's Close Price)
          //   "Q": "106.40000000",      // 최근 거래의 체결된 수량 (Last Quantity)
          //   "b": "0.92700000",        // 최고 매수 가격 (Best Bid Price)
          //   "B": "8157.40000000",     // 최고 매수 수량 (Best Bid Quantity)
          //   "a": "0.92800000",        // 최저 매도 가격 (Best Ask Price)
          //   "A": "42.30000000",       // 최저 매도 수량 (Best Ask Quantity)
          //   "o": "0.96300000",        // 시가 (Open Price)
          //   "h": "0.98100000",        // 고가 (High Price)
          //   "l": "0.89800000",        // 저가 (Low Price)
          //   "v": "13218390.40000000", // 거래량 (Volume)
          //   "q": "12557501.86440000", // 거래 금액 (Quote Asset Volume)
          //   "O": 1689307686955,       // 시가 타임스탬프 (Open Time)
          //   "C": 1689394086955,       // 종가 타임스탬프 (Close Time)
          //   "F": 67096273,            // 처음 거래 ID (First Trade ID)
          //   "L": 67129443,            // 마지막 거래 ID (Last Trade ID)
          //   "n": 33171                // 거래 횟수 (Trade Count)
          // }
      }
    }

    if(data?.type == "trade" || data?.type == "transaction" || data?.e =="trade"){
      
      switch(exchange){
        case EXCHANGE_UPBIT:
          return [
            {
              type : TYPE_TRADE,
              market : data.code,
              base : data.code.split("-")[1],
              quote : data.code.split("-")[0],
              price : data.trade_price,
              volume : data.trade_volume,
              ask_bid : data.ask_bid =="BID"?TYPE_BID:TYPE_ASK,
              //prev_price : data.prev_closing_price,
              timestamp : data.timestamp
            }
          ];

              // {
              //   type: 'trade',
              //   code: 'KRW-BTC',
              //   timestamp: 1688569587136,
              //   trade_date: '2023-07-05',
              //   trade_time: '15:06:27',
              //   trade_timestamp: 1688569587110,
              //   trade_price: 40120000,
              //   trade_volume: 0.06279356,
              //   ask_bid: 'ASK',
              //   prev_closing_price: 40610000,
              //   change: 'FALL',
              //   change_price: 490000,
              //   sequential_id: 1688569587110000,
              //   stream_type: 'REALTIME'
              // }
              // if(code == "KRW-BTC"){
              //   console.log(data);
              // }
        case EXCHANGE_BITHUMB:
         
          return data.content.list.map(item =>{
          
            return {
              type : TYPE_TRADE,
              market : item.symbol,
              base : item.symbol.split("_")[0],
              quote : item.symbol.split("_")[1],
              price : item.contPrice,
              volume : item.contQty,
              ask_bid : item.buySellGb ==1?TYPE_ASK :TYPE_BID,
              //prev_price : item.contPrice, //data.prev_closing_price,
              timestamp : moment(item.contDtm).valueOf()
            }
          })
        
        // {
        //     "type" : "transaction",
        //     "content" : {
        //         "list" : [
        //             {
        //                 "symbol" : "BTC_KRW",                   // 통화코드
        //                 "buySellGb" : "1",                          // 체결종류(1:매도체결, 2:매수체결)
        //                 "contPrice" : "10579000",                   // 체결가격
        //                 "contQty" : "0.01",                         // 체결수량
        //                 "contAmt" : "105790.00",                    // 체결금액
        //                 "contDtm" : "2020-01-29 12:24:18.830039",   // 체결시각
        //                 "updn" : "dn"                               // 직전 시세와 비교 : up-상승, dn-하락
        //             }
        //         ]
        //     }
        // }

        case EXCHANGE_BINANCE:
          let baseQuote = extractBaseQuote(data.s);
         
          return [
            {
              type : TYPE_TRADE,
              market : data.s,
              base : baseQuote.base,
              quote : baseQuote.quote,
              price : data.p,
              volume : data.q,
              ask_bid : data.m ?TYPE_ASK :TYPE_BID,
              //prev_price : item.contPrice, //data.prev_closing_price,
              timestamp : data.T
            }
          ]

          // {
          //   "e": "trade",         // 이벤트 타입 (Event Type): 거래 이벤트
          //   "E": 1689394132002,   // 이벤트 시간 (Event Time): 타임스탬프 (밀리초 단위)
          //   "s": "STXUSDT",       // 심볼 (Symbol): 거래가 발생한 가상화폐 심볼
          //   "t": 37381119,        // 거래 ID (Trade ID): 거래의 고유 식별자
          //   "p": "0.64050000",    // 가격 (Price): 거래의 체결 가격
          //   "q": "49.70000000",   // 수량 (Quantity): 거래의 체결된 수량
          //   "b": 460966168,       // 구매자 주문 ID (Buyer Order ID)
          //   "a": 460966133,       // 판매자 주문 ID (Seller Order ID)
          //   "T": 1689394132001,   // 거래 시간 (Trade Time): 거래가 체결된 타임스탬프 (밀리초 단위)
          //   "m": false,           // 체결 유형 (Is the buyer the market maker?): false일 경우 구매자가 시장 메이커가 아님
          //   "M": true             // 마켓 메이커 거래 (Ignore): 무시해도 되는 추가 정보
          // }
      }
    }

    return [];
  }

  let url = null;
  switch(exchange){
    case EXCHANGE_UPBIT:
      url = 'wss://api.upbit.com/websocket/v1';
      break;
    case EXCHANGE_BITHUMB:
      url = 'wss://pubwss.bithumb.com/pub/ws';
      break;
    case EXCHANGE_BINANCE: // 바이낸스는 소켓 연결 시에 마켓 정보를 담아서 요청한다
      url = 'wss://stream.binance.com:9443/ws';
      break;
  }

// 웹소켓 연결
  const ws = new ReconnectingWebSocket(url, [], {
    WebSocket: WebSocket,
  });

  //ws.reconnectInterval = 60000; // try to reconnect after 10 seconds

  ws.addEventListener('open', () => {
    //console.log(`${exchange} WebSocket connection opened`);
    
    // 마켓 필터에 따라서 제외한다.
    switch(exchange){
      case EXCHANGE_UPBIT:
      case EXCHANGE_BITHUMB:
        for(let base in bucket){
         
          // filter_market == 1 , ALL
          if(filter_market_ == 2 && bucket[base].quote != "KRW"){
            delete bucket[base];
            continue;
          }

          if(filter_market_ == 3 && bucket[base].quote != "BTC"){
            delete bucket[base];
            continue;
          }
        }
        break;
        
      case EXCHANGE_BINANCE:
        // for(let base in bucket){
         
        //   if(filter_market_ == 2 && bucket[base].quote != "USDT"){
        //     delete bucket[base];
        //     continue;
        //   }
        //   if(filter_market_ == 3 && bucket[base].quote != "USD"){
        //     delete bucket[base];
        //     continue;
        //   }

        //   if(filter_market_ == 4 && bucket[base].quote != "BUSD"){
        //     delete bucket[base];
        //     continue;
        //   }

        //   if(filter_market_ == 5 && bucket[base].quote != "BTC"){
        //     delete bucket[base];
        //     continue;
        //   }else{
           
        //   }
        // }
        break;
    }

    switch(exchange){
      /** UPBIT **/
      case EXCHANGE_UPBIT:
        let messages = [];
        messages.push( {"ticket": `bitpump_${Date.now()}`});

        //add ticker market
        messages.push( {
          type: 'ticker',
          codes: Object.keys(bucket).map(key =>{
            let {base , quote} = bucket[key];
            return  `${quote}-${base}`; // kRW-BTC
          })
        });
        
        // 마켓필터로 인해 BTC가제거된경우 BTC마켓 원화환산을 위해 추가해야한다.
        if(bucket["BTC"] == null){
          messages[1].codes.push(`KRW-BTC`)
        }

        //add trade market
        messages.push( {
          type: 'trade',
          codes: Object.keys(bucket).map(key =>{
            let {base , quote} = bucket[key];
            return  `${quote}-${base}`; // kRW-BTC
          }),
        });

        ws.send(JSON.stringify(messages));

        break;

      /** BITHUMB **/
      case EXCHANGE_BITHUMB:

        // 마켓필터로 인해 BTC가제거된경우 BTC마켓 원화환산을 위해 추가해야한다.
       
        let symbols = Object.keys(bucket).map(key =>{
          let market_info = bucket[key];
          let base = market_info.base;
          let quote = market_info.quote;
          return  `${base}_${quote}`;
        })

        if(bucket["BTC"] == null){
          symbols.push(`BTC_KRW`)
        }

        //1. subscribe ticker
        ws.send( JSON.stringify({
          type: 'ticker',
          symbols: symbols,
          tickTypes: ['24H'], // MID
        }));


        //2. subscribe trade
        ws.send( JSON.stringify({
          type: 'transaction',
          symbols: Object.keys(bucket).map(key =>{
            let market_info = bucket[key];
            let base = market_info.base;
            let quote = market_info.quote;
            return  `${base}_${quote}`;
          })
        }));

        break;

        
      /** BINANCE **/
      case EXCHANGE_BINANCE:

        let params =  Object.keys(bucket).map(key =>{
          let {base , quote} = bucket[key];
          return `${base}${quote}@ticker`.toLowerCase(); // kRW-BTC
        });
        
        if(bucket["BTC"] == null){
          params.push(`btcusdt@ticker`)
        }
    
        // 1. subscrive ticker
        ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params : params,
          id: 1
        }))

        // 2. subscrive trade
        ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params : Object.keys(bucket).map(key =>{
            let {base , quote} = bucket[key];
            return `${base}${quote}@trade`.toLowerCase(); // kRW-BTC
          }),
          id: 2
        }))
      
        break;
    }
  });

  ws.addEventListener('message', (event) => {
    //console.log(event.data);
    let obj_list = parseCommonObj(exchange, JSON.parse(event.data));
  
    for(let data of obj_list){
      let {type , price , market , base , quote} = data;
      switch(type){
        case TYPE_TICKER:
          let {price , prev_price , high , low } = data;

          let upper_market = market.toUpperCase();

          // BTC 마켓 현재가 환산을 위한 값 산출 및 비트코인 변동 알림을 위한 값 설정
          if(upper_market == "KRW-BTC" || upper_market =="BTC_KRW" || upper_market =="BTCUSDT"){

            if(upper_market == "BTCUSDT"){
              latest_btc_krw_price = price * USD2KRW;
            }else{
              latest_btc_krw_price = price;
            }
            
            if(init_btc_price ==null){ // 변동률 계싼이기 때문에 환산하지 않는다
              init_btc_price =  price;
            }else{

              let chg_rate = ( price - init_btc_price)/init_btc_price * 100;
              btc_krw_daybefore = ( price - prev_price)/prev_price * 100;
          
              if(Math.abs(chg_rate) > 0.3){
                init_btc_price = price;
                addEventLog(`${colors.green("BTC")} ${chg_rate>0?colors.red(`▲ ${chg_rate.toFixed(2)}%`):colors.blue(`▼ ${chg_rate.toFixed(2)}%`)}`)
              }
            }
          }

          // 현재 값 변동시 빤짝힘 효과를 주기 위한 객체 값 갱신
          ticker_price_bucket[base] = {
            trade_price : price, // 현재가
            prev_closing_price : prev_price // 전일 종가 
          };
        
          // 마켓 정보 가격 갱신 
          if(bucket[base]){
            //console.log(base)
            
            let market_info = bucket[base];
            market_info.price = price;
            market_info.high = high;
            market_info.low = low;

            // 고가 변동시 깜박임 효과를 주기위함
            if(high_price_change_object[base] == null){
              high_price_change_object[base] = {
                trade_price : high,
                timestamp : null
              }
            }else{
              if(high_price_change_object[base].trade_price < high){

                //addEventLog(base +"h:"+ high_price_change_object[base].trade_price +"::"+high)
                high_price_change_object[base] = {
                  trade_price : high,
                  timestamp : Date.now()
                }
              }
              high_price_change_object[base].trade_price = high;
            }

            // 저가 변동 시 깜박힘 효과를 주기 위함
            if(low_price_change_object[base] == null){
              low_price_change_object[base] = {
                trade_price : low,
                timestamp : null
              }
            }else{
              if(low_price_change_object[base].trade_price > low){
                
                //addEventLog(base +"r:"+ low_price_change_object[base].trade_price +"::"+low)
                low_price_change_object[base] = {
                  trade_price : low,
                  timestamp : Date.now()
                }
              }
              low_price_change_object[base].trade_price = low
            }
          }
          break;
        case TYPE_TRADE:
          if(bucket[base]){
          
            let market_info = bucket[base];
            //handleTrade(market_info,base, data);

            switch(quote){
              case "BTC":
                // 원화 비트코인 값이 초기화되지 않으면 BTC마켓은 처리하지 않는다.
                if(latest_btc_krw_price == null){
                  return;
                }
              case "BUSD": // usd2krw 값 초기화 필요
              case "USDT": // usd2krw 값 초기화 필요
              case "KRW":
                //console.log(market_info)
                handleTrade2(market_info, base, quote, data);
                break;
            }
          }

          break;
      }
    }
  
    //console.log('Received message:',data );
  });

  ws.addEventListener('close', () => {
    //console.log('WebSocket connection closed');
  });

  ws.addEventListener('error', (e) => {
    console.log('WebSocket connection Error',e.message);
  });
}

function getOneMinuteTimeKey(timestamp){
  return timestamp - (timestamp % 60000) ;
}
const getKrwPrice = (quote , price ) =>{
  let adjust = 1; 
  
  switch(exchange){
    case EXCHANGE_UPBIT:
    case EXCHANGE_BITHUMB:
      switch(quote){
        case "KRW":
          adjust = 1;
          break;
        case "BTC":
          adjust = latest_btc_krw_price;
          break;
          
      }
      break;
    case EXCHANGE_BINANCE:
      switch(quote){
        case "USDT":
        case "BUSD":
          adjust = USD2KRW;
          break;
        case "BTC":
          adjust = latest_btc_krw_price + USD2KRW;
          break;
      }
      break;
  }

  return price * adjust;
}


function getTradeStore(base, trade_history){
  return trade_history.reduce((acc,trade) =>{

    let { market, base ,quote , price  , volume , ask_bid } = trade;
    let trade_price = getKrwPrice(quote,price);
    let krw_volume = trade_price * volume;

    acc.total_volume += krw_volume;

    if(ask_bid == TYPE_ASK){
      acc.sell_volume += krw_volume;
    }else{
      acc.buy_volume += krw_volume;
    }

    // 변동률 계산
    if (!acc.high || trade_price > acc.high) {
      acc.high = trade_price; // 고가 업데이트
    }
    if (!acc.low || trade_price < acc.low) {
      acc.low = trade_price; // 저가 업데이트
    }

    //console.log(acc.high ,acc.low);

    return acc;
  }, {
    total_volume : 0,
    buy_volume : 0,
    sell_volume : 0,
    high: 0,
    low: 0,
    bid : current_bid_ask_object[base]?.bid, // 당시 또는 현재 매수 비율
    ask : current_bid_ask_object[base]?.ask // 당시 또는 현재 매도 비율
  })

}

function formatNumber2(number) {
  const formattedNumber = new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 15
  }).format(number);

  return formattedNumber;
}



function updateTradeObject(base, quote, trade){

  // 최초 한번 초기화 .. 특정 시간당 거래량 , 변동률 알림을 발생하기 위함
  // if(trade_object[base] == null){
  //   trade_object[base] = [];
  // }

  if(total_trade_object[base] ==null){
    total_trade_object[base] = [];
  }

  if(bid_trade_object[base] ==null){
    bid_trade_object[base] = [];
  }
  
  if(ask_trade_object[base] ==null){
    ask_trade_object[base] = [];
  }

  let { timestamp ,price , volume, ask_bid} = trade

  for (let i = total_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = total_trade_object[base][i];
    if (timestamp - t >= 2000) { 
      total_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  for (let i = bid_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = bid_trade_object[base][i];
    if (timestamp - t >= 2000) { 
      bid_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  for (let i = ask_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = ask_trade_object[base][i];
    if (timestamp - t >= 2000) { 
      ask_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  let trade_price_krw = getKrwPrice(quote,price);
  let volume_krw = trade_price_krw * volume;

  total_trade_object[base].push({
    t : timestamp,
    v : volume_krw,
    p : price
  })

  if(ask_bid ==TYPE_ASK){
    ask_trade_object[base].push({
      t : timestamp,
      v : volume_krw,
      p : price
    })
  }else{
    bid_trade_object[base].push({
      t : timestamp,
      v : volume_krw,
      p : price
    })
  
  }

  // let result = trade_object[base].reduce((acc, value)=>{
  //   let { v ,ask_bid } = value;

  //   acc.total_volume +=v;
  //   if(ask_bid == "BID"){
  //     acc.buy_volume +=v;
  //   }else{
  //     acc.sell_volume +=v;
  //   }

  //   return acc;
    
  // },{
  //   total_volume : 0,
  //   buy_volume : 0,
  //   sell_volume : 0
  // })

  let total_result = total_trade_object[base].reduce((acc, value)=>{
    let { v , p } = value;
    acc.total_volume +=v;
    return acc
  },{
    total_volume : 0,
  })

  let bid_result = bid_trade_object[base].reduce((acc, value)=>{
    let { v , p} = value;
    acc.total_volume +=v;

    if(acc.high ==null){
      acc.high = p;
    }else{
      acc.high = Math.max(acc.high,p);
    }

    if(acc.low ==null){
      acc.low = p;
    }else{
      acc.low = Math.min(acc.low,p);
    }
    
    acc.change_rate = Math.abs(((acc.high - acc.low) / acc.low) * 100);

    return acc;
  },{
    total_volume : 0,
    high : null,
    low : null,
    change_rate : 0,
  })

  let ask_result = ask_trade_object[base].reduce((acc, value)=>{
    let { v , p} = value;
    acc.total_volume +=v;

    if(acc.high ==null){
      acc.high = p;
    }else{
      acc.high = Math.max(acc.high,p);
    }

    if(acc.low ==null){
      acc.low = p;
    }else{
      acc.low = Math.min(acc.low,p);
    }
    
    acc.change_rate = Math.abs(((acc.high - acc.low) / acc.low) * 100);

    return acc;
  },{
    total_volume : 0,
    high : null,
    low : null,
    change_rate : 0,
  })

  // if(bid_result.total_volume  > EVENT_VOLUME){  // 1초만에 일정금액 한방에 긁음
  //   //알림이 발생되면 초기화한다.
  //   bid_trade_object[base] = [];
  //   addEventLog(`[${getHHmmss()}] ${base.padEnd(6)} ${colors.red(formatNumber(bid_result.total_volume))}`)
  // }

  // if(ask_result.total_volume  > EVENT_VOLUME){  // 1초만에 일정금액 한방에 긁음
  //   //알림이 발생되면 초기화한다.
  //   ask_trade_object[base] = [];
  //   addEventLog(`[${getHHmmss()}] ${base.padEnd(6)} ${colors.blue(formatNumber(ask_result.total_volume))}`)
  // }

  if(total_result.total_volume > event_volume_){
    total_trade_object[base] = [];
    bid_trade_object[base] = [];
    ask_trade_object[base] = [];

    if(bid_result.total_volume >1000000){ // 꼽싸리는 뺴기위해 100만원이상만
      addEventLog(`${base.padEnd(6)} ${colors.red(formatNumber(bid_result.total_volume))}  ${bid_result.change_rate>0.4?bid_result.change_rate.toFixed(2)+"%":''}`,{
        base : base,
        type : TYPE_BID,
        volume : bid_result.total_volume,
        change_rate : bid_result.change_rate
      })
    }

    if(ask_result.total_volume >1000000){ // 꼽싸리는 뺴기위해 100만원이상만
      addEventLog(`${base.padEnd(6)} ${colors.blue(formatNumber(ask_result.total_volume))}  ${ask_result.change_rate>0.4?ask_result.change_rate.toFixed(2)+"%":''}`,{
        base : base ,
        type : TYPE_ASK,
        volume : ask_result.total_volume
      })
    }

    if(event_object[base] == null){
      event_object[base] = {
        timestamp : Date.now(),
        type : "volume",
        value : total_result.total_volume,
      }
    }else{
      // 알림 표시 시간이 지난 이벤트는 새로운 알림 발행
      if((Date.now() - event_object[base].timestamp) > EVENT_NOTI_TIME){
        event_object[base] = {
          timestamp : Date.now(),
          type : "volume",
          value : total_result.total_volume,
        }
      }else{
        // 알림 표시 시간이 안지난 이벤트 인경우 다른 알림이 표시되고있는 상태이면 기다리고 같은 타입이면 누적한다.
        if(event_object[base].type =="volume"){ // 같은 타입이면 누적
          event_object[base].value += total_result.total_volume;
          //event_object[base].timestamp = Date.now()
        }else{
          // 다른 타입의 알람을 지우고 새로 발생된 알림을 넣고싶으면 여기를 코딩할것 !
        }
      } 
    }
  }
}


function updatePriceChangeObject(base , trade_price){
  if(price_change_object[base] == null){
    price_change_object[base] = {
      trade_price : trade_price,
      timestamp : null
    }
  }else{
    if(price_change_object[base].trade_price != trade_price){
      price_change_object[base] = {
        trade_price : trade_price,
        timestamp : Date.now()
      }
    }
  }
}


let latest_time_bucket = {}; // base 별 마지막 최근 time_key를 저장 , 시간 변경 시 통계 진행.
let ticker_price_bucket = {}; // 현재가가 변경되면 깜박임 효과를 주기위함
let start_time = null;
function handleTrade2(object, base, quote, trade) {

  let { timestamp ,price } = trade


  // if(trade_price_bucket[base] ==null){
  //   trade_price_bucket[base] = {
  //     trade_price : price,
  //     prev_closing_price : price
  //   };
  // }else{
  //   trade_price_bucket[base] = {
  //     trade_price : price,
  //     prev_closing_price : trade_price_bucket[base].trade_price
  //   };
  // }

  let time_key = getOneMinuteTimeKey(timestamp)

  // 최초 한번 초기화
  if(object.trade_store == undefined){
    object.trade_store = {}; // 현재 및 이전 N분의 통계이력 저장
    object.trade_history = []; // 현재 타임 Key의 이력저장
  }

  // 최초 한번 초기화
  if(latest_time_bucket[base] == null){
    latest_time_bucket[base] = time_key;
  }

  let latest_time_key = latest_time_bucket[base];

  // 신규 키 값 발견
  if(latest_time_key < time_key && latest_time_key != time_key){
    
    // ***** 이전 키값 통계 진행
    object.trade_store[latest_time_key] = getTradeStore(base,object.trade_history);
    
    // ***** n분 이상 데이터 지우기
    Object.keys(object.trade_store).forEach(time_key=>{
    
      if(60000 * collection_time_  < Date.now() - Number(time_key)   ){
        //delete object.trade_store[time_key]
      }
    });

    // 최근 키값 갱신
    latest_time_bucket[base] = time_key;
    object.trade_history = [trade];
  }else{
    object.trade_history.push(trade);
  }
  // if(base == "BTC"){
  //   console.log(object.trade_history.length);
  // }

  object.trade_store[time_key] = getTradeStore(base,object.trade_history);

  updatePriceChangeObject(base ,price);
  updateTradeObject(base , quote, trade);

}


let event_object = {};
let total_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let bid_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let ask_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let high_price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let low_price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let current_bid_ask_object = {}; // 심볼별 최근 bid, ask 값 저장
let latestVolumeRank = [];
let bucket = {};

async function startVolumeRanker() {
  start_time = Date.now();

  switch(exchange){
    case EXCHANGE_UPBIT:
      await initMarketInfo(upbitExchange ,['KRW','BTC'], bucket)
      break;
    case EXCHANGE_BITHUMB:
      await initMarketInfo(bithumbExchange ,['KRW','BTC'], bucket) //,'BTC'
      break;
    case EXCHANGE_BINANCE:
      await initMarketInfo(binanceExchange ,['USDT','BUSD','BTC'], bucket) //,'BTC'
      break;
  }

  connectWebsocket(exchange ,bucket);

  setInterval(()=>{
    let result = {};

    for(let base in bucket){
      let object  = bucket[base];

      if(object.trade_store){

        // if(base == "BTC"){
        //   console.log(base,object.trade_store);
        // }

        result[base] = Object.keys(object.trade_store).map(time_key => object.trade_store[time_key]).reduce((acc, value)=>{
          
          acc.total_volume +=value.total_volume;
          acc.buy_volume +=value.buy_volume;
          acc.sell_volume +=value.sell_volume;

                // 변동률 계산
          if (!acc.high || value.high > acc.high) {
            acc.high = value.high; // 고가 업데이트
          }
          if (!acc.low || value.low < acc.low) {
            acc.low = value.low; // 저가 업데이트
          }

          acc.change_rate = ((acc.high - acc.low) / acc.low) * 100;

          return acc
        },{
          total_volume : 0,
          buy_volume : 0,
          sell_volume : 0,
          high : null,
          low : null,
          change_rate : 0,
          quote : object.quote
        })

      }
    }

    let bases = Object.keys(result);
    bases = bases.filter(s => result[s].total_volume != null);

    // accVolume을 내림차순으로 정렬
    bases.sort((a, b) => result[b]?.total_volume - result[a]?.total_volume);

    //console.log(`========= ${SAVE_MINUTE}분간  거래량 순위 (시장 집중도)   =======`);
    
    // if(Date.now() - start_time < SUM_MINUTE * 60000){
    //   let progress =  ((Date.now() - start_time)/ (SUM_MINUTE *60000)) * 100;
    //   updateInfoBox2(`Progress >> ${progress.toFixed(2)}%`);
    // }
  
    let i =0;
    let logData= [];
    let volumeBaseRank = [];
    let total_volume_sum =0;
    let buy_volume_sum =0;
    let sell_volume_sum =0;
    bases.forEach(base =>{
      let object = result[base];

      // 전체장 통계를
      total_volume_sum += object.total_volume;
      buy_volume_sum += object.buy_volume;
      sell_volume_sum += object.sell_volume;
      
      let row = ['','','','','','','','']
      // if(base == "BTC"){
      //   console.log(trade_price_bucket[base]);
      //   return;
      // }

      //if(i <SHOW_COIN_COUNT){

        //headers: ['Idx', 'Base', 'Quote','Day Before','Price',`${SUM_MINUTE}Min Volume`,'(BID:ASK)','ChgRate(ABS)','Event'],
        // 1. index 
      row[COLUM_INDEX] = select_base == base ?colors.bgYellow(i+1):i+1;

      if(event_object[base] && event_object[base].timestamp && (Date.now() - event_object[base].timestamp)  < EVENT_NOTI_TIME){
        row[COLUM_BASE] = colors.yellow(base);
        row[COLUM_VOLUME] = colors.yellow(formatNumber(object.total_volume));
      }else{
        row[COLUM_BASE] = base;
        row[COLUM_VOLUME] = formatNumber(object.total_volume);
      }
      
      switch(exchange){
        case EXCHANGE_UPBIT:
        case EXCHANGE_BITHUMB:
          row[COLUM_QUOTE] = object.quote == "KRW"?`${colors.red(object.quote)}`:`${colors.blue(object.quote)}`;
          break;
        case EXCHANGE_BINANCE:
          row[COLUM_QUOTE] = object.quote == "USDT"?`${colors.red(object.quote)}`:object.quote == "BUSD"?`${colors.green(object.quote)}`:`${colors.blue(object.quote)}`;
            break;
      }
      
      let changeRate = 0;
      if(ticker_price_bucket[base]){
        let {trade_price , prev_closing_price} = ticker_price_bucket[base];
        changeRate = ((trade_price - prev_closing_price) / prev_closing_price) * 100;

        row[COLUM_DAYBEFORE] = changeRate==0?`${changeRate.toFixed(2)}%`:(changeRate>0?`${colors.red(Math.abs(changeRate).toFixed(2))}%`:`${colors.blue(Math.abs(changeRate).toFixed(2))}%`);
        row[COLUM_PRICE] = formatNumber2(trade_price);

       
        if(bucket[base].high ){
          row[COLUM_HIGH] = `${formatNumber2(bucket[base].high)}`;
         
        }
        if(bucket[base].low){
          row[COLUM_LOW] = `${formatNumber2(bucket[base].low)}`;
        }

        if(high_price_change_object[base] && high_price_change_object[base].timestamp){
          if((Date.now() - high_price_change_object[base].timestamp) < 3000){
            row[COLUM_HIGH] = colors.bgRed(formatNumber2(bucket[base].high ));
          }
        }

        if(low_price_change_object[base] && low_price_change_object[base].timestamp){
          if((Date.now() - low_price_change_object[base].timestamp) < 3000){
            row[COLUM_LOW] = colors.bgBlue(formatNumber2(bucket[base].low));
          }
        }

        if(price_change_object[base] && price_change_object[base].timestamp){
          if((Date.now() - price_change_object[base].timestamp) < 200){
            row[COLUM_PRICE] = colors.green(formatNumber2(trade_price));
          }
        }
      }

      let bid = parseInt(((object.buy_volume/object.total_volume) * 100));
      let ask = parseInt(((object.sell_volume/object.total_volume) * 100));
      
      updateBidAskObject(base,bid,ask);

      row[COLUM_BID_ASK] = `(${bid > 50 ?colors.red(bid):bid}:${ask > 80 ?colors.blue(ask):ask})`; 
      row[COLUM_ABSCHG] = object.change_rate.toFixed(2)+"%";
      
      //row[COLUM_ABSCHG] = "±"+(object.change_rate<1.5?object.change_rate.toFixed(2):(object.change_rate <3.0?colors.yellow(object.change_rate.toFixed(2)):colors.red(object.change_rate.toFixed(2))))+"%";
      row[COLUM_EVENT] =  ''
      if(event_object[base]){
      
        let {timestamp , value, type } = event_object[base];
        if((Date.now() - timestamp)  < EVENT_NOTI_TIME){ // 15초간 고정

          switch(type){
            case "volume":
              //row[COLUM_EVENT]  = colors.yellow(`volume ${(value/100000000).toFixed(1)}B`)
              row[COLUM_EVENT]  = colors.yellow(`+${formatNumber(value)}`); 
              break;
          }
        }else{
          row[COLUM_EVENT]  = '';
        }
        
      }
      //console.log(row);
      logData.push(row)
      volumeBaseRank.push(base);
      //}
      i++;
    })

    let total_buy = parseInt(((buy_volume_sum/total_volume_sum) * 100));
    let total_sell = parseInt(((sell_volume_sum/total_volume_sum) * 100));

    latestVolumeRank = volumeBaseRank;
    updateBuySell(total_buy,total_sell , total_volume_sum)
    updateTable(logData);
    updateEventLogs();

    if(select_base){
      
      //addEventLog(select_base)
      line_chart.setLabel(`${colors.yellow(select_base)} Buy/Sell History`)
      let trade_store =  bucket[select_base]?.trade_store;

      if(trade_store){

        if(current_bid_ask_object[select_base]){
          let x = [];
          let y1=  [];
          let y2=  [];
        
          Object.keys(trade_store).map(time_key =>{
            x.push(getHHmm(time_key));
            return trade_store[time_key] ;
          }).forEach((object)=>{
            y1.push(object.bid)
            y2.push(object.ask)
          });
  
          line_chart.setData([ {
            title: 'Buy',
            style: {line: 'red'},
            x: x,
            y: y1
          }, {
            title: 'Sell',
            style: {line: 'blue'},
            x: x,
            y: y2
          }])
  
          
          // if(toggle_chart){
          
          // }else{
           
          // }
        }else{
          //bar_chart.hide();
          //line_chart.hide();
        }
        
        line_chart.show();
      }else{

        line_chart.hide();
      }
      
    }else{
      //bar_chart.hide();
      line_chart.hide();
    }

   
    screen.render();
    // 로그 갱신 함수

  }, INTERVAL_TIME);
}

function formatNumber(number) {
  return number.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

function setLineData(mockData, line) {
  for (var i=0; i<mockData.length; i++) {
    var last = mockData[i].y[mockData[i].y.length-1]
    mockData[i].y.shift()
    var num = Math.max(last + Math.round(Math.random()*10) - 5, 10)    
    mockData[i].y.push(num)  
  }
  line.setData(mockData)
}

const COLUM_INDEX = 0;
const COLUM_BASE = 1;
const COLUM_QUOTE = 2;
const COLUM_DAYBEFORE = 3;
const COLUM_PRICE = 4;
const COLUM_HIGH = 5;
const COLUM_LOW = 6;
const COLUM_BID_ASK = 7;
const COLUM_VOLUME = 8;
const COLUM_ABSCHG = 9;
const COLUM_EVENT = 10;

function updateTable(table_data){
  //data_table.setData(table_data);
  //console.log(table_data);

  // if(Date.now() - start_time <= SUM_MINUTE * 60000){
  //   let progress =  ((Date.now() - start_time)/ (SUM_MINUTE *60000)) * 100;
  // }
  let progress = ((Date.now() - start_time)/ (collection_time_ *60000)) * 100
  data_table.setLabel(` ${collection_time_}-Min ${exchange} Volume List ${getTime(Date.now())}, ${USD2KRW !=null?"USD2KRW: "+USD2KRW:''} Progress: ${progress<100?progress.toFixed(2):100}% ` )
  data_table.setData({
    headers: ['Idx', 'Base', 'Quote','ChgRate','Price','High','Low','(Buy:Sell)',`Volume`,`${collection_time_}min(%)`,'Event'],
    data: [
      ...[['','','','','','','','','',''],
      ...table_data]
    ],
  });
  //screen.render();
}

let screen;
let select_base = null;
let toggle_chart = true;
let data_table , info_box , info_box2, event_log, store_progress, buy_sell_progress, line_chart ; 

function initUI(){
  
  screen = blessed.screen()
  let grid = new contrib.grid({rows: 12, cols: 12, screen: screen})

  data_table = grid.set(0, 0, 12, 9, contrib.table, {
      keys: true,
      fg: 'white',
      // selectedFg: 'white',
      // selectedBg: 'blue',
      interactive: true,
      label: 'Volume Rank Table',
      columnSpacing: 1, // in chars
      columnWidth: [4, 8, 6, 10, 14, 14,14, 11, 21,10, 12] /* in chars */
  })
  
  data_table.rows.on('select', (item, index) => {

    if(index == 0){
      select_base = null;
    }else{
      select_base = latestVolumeRank[index-1];
      //addEventLog("select >> " + select_base)
    }
  })
  data_table.focus();
  

  info_box = grid.set(0, 9, 1, 3, blessed.box, {label: `${colors.rainbow("Copyright (c) Bitpump")}`, content: `${`Search "${colors.yellow('Bitpump')}" on Google PlayStore`}`})
  //info_box2 = grid.set(1, 9, 1, 3, blessed.box, {label: 'Progress', content: ''})
  
  event_log = grid.set(1, 9, 11, 3, contrib.log, 
      { 
        // fg: "green"
       selectedFg: "green",
       reverse: true,
       label: 'Event'})
  //store_progress = grid.set(8, 9, 2, 3, contrib.gauge, {label: 'Collect Progress', percent: [0]})

  //line_chart = grid.set(6, 9, 4, 3, contrib.line, 
  line_chart = grid.set(8, 6, 4, 3, contrib.line, 
    { 
     maxY: 125
    , label: 'Total Transactions'
    , showLegend: false
    , showNthLabel : false
    , legend: {width:5}})

  line_chart.hide();
    

  buy_sell_progress = grid.set(10, 9, 2, 3, contrib.gauge, {label: 'Buy/Sell', stack : [{percent:0,stroke:'red'},{percent:0,stroke:'blue'}]})


  //y1, x1 , y2 ,x2
  screen.on('resize', function() {
      info_box.emit('attach');
      //info_box2.emit('attach');
      //store_progress.emit('attach');
      data_table.emit('attach');
      event_log.emit('attach');
      buy_sell_progress.emit('attach');
      line_chart.emit('attach');
  });

  screen.key(['left', 'right','escape', 'q', 'C-c'], function (ch, key) {
    if (key.name === 'left' || key.name === 'right') {
      if(select_base !=null){
        toggle_chart = !toggle_chart;
      }
    }else{
      return process.exit(0);
    }
  });

}


const getExchangeConfig = (exchange) =>{
  const config = require('./config.js');
  return config[exchange];

}

// 조건 입력 받기
async function getConditions() {
  if(process.argv[2]){ // 0 : node.exe , 1: file.js , 2: exchange_param (upbit,bithumb,binance)
    switch(process.argv[2]){
      case EXCHANGE_BINANCE:
        
        USD2KRW = await getUSD();

        if(USD2KRW == null){
          console.log("latest USD2KRW init Fail");
          return;
        }

      case EXCHANGE_UPBIT:
      case EXCHANGE_BITHUMB:
        exchange = process.argv[2];

        let {collection_time , filter_market , event_volume , event_log_save_timeout} = getExchangeConfig(exchange);

        collection_time_ = collection_time;
        filter_market_=  filter_market;
        event_volume_ = event_volume * 10000000;
        event_log_save_timeout_ = event_log_save_timeout;

        // switch(exchange){
        //   case EXCHANGE_UPBIT:
        //     await initMarketInfo(upbitExchange ,['KRW','BTC'], bucket)
        //     break;
        //   case EXCHANGE_BITHUMB:
        //     await initMarketInfo(bithumbExchange ,['KRW','BTC'], bucket)
        //     break;
        //   case EXCHANGE_BINANCE:
        //     await initMarketInfo(binanceExchange ,['USDT'], bucket)
        //     break;
        // }

        //connectWebsocket(exchange ,bucket);
        
        initUI();
        startVolumeRanker().catch((error) => console.error(error));
        break;
      default:
        console.log("@ invalid param");
        break;
    }
  }else{
    console.log("# invalid param");
  }



  // UI 초기화
}

const logEntries = [];
function addEventLog(log , meta){
  //event_log.log(log)  
  logEntries.unshift({
    content : `[${getHHmmss()}] ${log}`,
    timestamp : Date.now(),
    meta : meta
  }); // Add the new entry to the beginning of the array

}
function getKeysSortedByValueDescending(obj) {
  // 객체의 키들을 배열로 변환
  let keys = Object.keys(obj);

  // 키들을 값에 따라 내림차순으로 정렬
  keys.sort(function (a, b) {
    return obj[b] - obj[a];
  });

  return keys;
}


function updateEventLogs(){

  let event_object_base = Object.keys(event_object).filter(base =>{
    if(Date.now() - event_object[base].timestamp < EVENT_NOTI_TIME){
      return true;
    }else{
      return false;
    }
  });

  let coloredEntries = [];
  const regex = new RegExp(`\\b(${event_object_base.join("|")})\\b`, "i");

  for (let i = logEntries.length - 1; i >= 0; i--) {
    const { timestamp } = logEntries[i];

    if (Date.now() - timestamp >=  60000 * event_log_save_timeout_ ) { // N 분이후의 로그는 제거한다.
      logEntries.splice(i, 1); // i번째 요소 삭제
    }
  }

  // 최근 10분 매수, 매도 1위 코인을 측정하기 위함
  let bid = {};
  let ask = {};
  for(let log of logEntries){
    let {content , meta} = log;
    const match = content.match(regex);
    if(match){
      coloredEntries.push(content.replace([match[0]], colors.yellow(match[0])));
    }else{
      coloredEntries.push(content);
    }

    //console.log(log);
    if(meta && meta?.type == TYPE_BID || meta?.type == TYPE_ASK ){
      let {base , type, volume} = meta;
      switch(type){
        case TYPE_BID:
          if(bid[base]  == null){
            bid[base] = volume
          }else{
            bid[base] += volume
          }
          break;
        case TYPE_ASK:
          if(ask[base]  == null){
            ask[base] = volume
          }else{
            ask[base] += volume
          }
          break;
      }
    }

  }

  let bid_rank = getKeysSortedByValueDescending(bid);
  let ask_rank = getKeysSortedByValueDescending(ask);

  let bid_label = null;
  if(bid_rank.length != 0){ // 1, 2위까지 표시
    if(bid_rank.length == 1){
      bid_label = colors.red(`${bid_rank[0]}`);
    }else{
      bid_label = colors.red(`${bid_rank[0]},${bid_rank[1]}`);
    }
  }

  let ask_label = null;
  if(ask_rank.length != 0){ // 1위만 표시
    if(ask_rank.length == 1){
      ask_label = colors.blue(`${ask_rank[0]}`);
    }else{
      ask_label = colors.blue(`${ask_rank[0]},${ask_rank[1]}`);
    }

    //ask_label = colors.red(`${ask_rank[0]}, ${ask_rank[1]}`);
  }

  
  let btc_day_before_label = null;
  if(btc_krw_daybefore){
    btc_day_before_label = `${"BTC"} ${btc_krw_daybefore>0?colors.red(`▲ ${Math.abs(btc_krw_daybefore).toFixed(2)}%`):colors.blue(`▼ ${Math.abs(btc_krw_daybefore).toFixed(2)}%`)}`;
  }


  let bid_ask_1st_base_label= `${bid_label?bid_label:'-'}/${ask_label?ask_label:'-'}`;

  event_log.setLabel(`[${btc_day_before_label?btc_day_before_label:''}] (${bid_ask_1st_base_label})`);
  event_log.setItems(coloredEntries);

}

function updateBuySell(buy, sell, total_volume){
  buy_sell_progress.setLabel(`(Buy/Sell) ${formatNumber(total_volume)}`); 
  //buy_sell_progress.setData([buy, sell])
  buy_sell_progress.setStack([{percent:buy,stroke:'red'},{percent:sell,stroke:'blue'}])
}

function updateBidAskObject(base ,bid ,ask){

  //addEventLog(base)
  if(current_bid_ask_object[base] == null){
    current_bid_ask_object[base] = {
      bid : bid,
      ask : ask,
    }
  }else{
    current_bid_ask_object[base].bid = bid;
    current_bid_ask_object[base].ask = ask;

  }
}



// 조건 입력 받기 시작
getConditions();
