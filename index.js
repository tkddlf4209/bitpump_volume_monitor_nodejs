const ccxt = require('ccxt');
const axios = require('axios').default;
const upbitExchange = new ccxt.upbit();
const bithumbExchange = new ccxt.bithumb();
const ReconnectingWebSocket = require('reconnecting-websocket');
const WebSocket = require('ws');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
let colors = require('colors/safe')
let moment = require('moment');
require('moment-timezone');
moment.tz.setDefault("Asia/Seoul");
const EVENT_NOTI_TIME = 15000;
let  event_volume_ = 50000000;
let event_log_save_timeout_ = 5;
let collection_time_ = 60;
let filter_market_ = 1; // 1. 전체 ,2 KRW , 3.BTC

/** 누적 시간(분) 설정 **/
const INTERVAL_TIME = 100;
let latest_btc_krw_price= null;
let init_btc_krw_price= null;
let btc_krw_daybefore = null;


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
  const exchangeId = cctx_.id; // upbit, bithumb

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
    let info = market.info; // 거래소 마다 들어있는 정보가 다를수있음

    if(( base && quote ) && includesQuote.includes(market.quote)){
      let market_info = null;

      switch(exchangeId){
        case "upbit":
          market_info ={
            base : base,
            quote : quote,
            // 업비트는 코인의 한글 , 영어 풀네임을 제공한다.
            names : {
              kor : info.korean_name,
              eng : info.english_name
            },
          }
          break;
        case "bithumb":
          market_info ={
            base : base,
            quote : quote
          }
          break;
      }

      if(market_info){
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
      }
    }
  }
}


function connectWebsocket(exchange,ticker, trade, bucket){

  let url = null;
  switch(exchange){
    case "upbit":
      url = 'wss://api.upbit.com/websocket/v1';
      break;
    case "bithumb":
      url = 'wss://pubwss.bithumb.com/pub/ws';
      break;
  }

// 웹소켓 연결
  const ws = new ReconnectingWebSocket(url, [], {
    WebSocket: WebSocket,
  });

  //ws.reconnectInterval = 60000; // try to reconnect after 10 seconds

  ws.addEventListener('open', () => {
    //console.log(`${exchange} WebSocket connection opened`);

    switch(exchange){
      case "upbit":
     
        for(let base in bucket){

          if(filter_market_ == 2 && bucket[base].quote != "KRW"){
            delete bucket[base];
            continue;
          }

          if(filter_market_ == 3 && bucket[base].quote != "BTC"){
            delete bucket[base];
            continue;
          }

          // trade 정보를 담을 배열을 초기화한다. 
          // 순간 체결 거래량, 변동률 값 계산 등에 사용된다. 
          
          //addEventLog(JSON.stringify(market_info))
        }

        // let filterBucket = Object.keys(bucket).filter(key=>{
        //   let market_info = bucket[key];
        //   let {quote} = market_info;

        //   if(FILTER_MARKET == 2 && quote !="KRW"){
        //     return true
        //   }

        //   if(FILTER_MARKET == 3 && quote !="BTC"){
        //     return true
        //   }

        //   return false;
        // })
        let messages = [];
        messages.push( {"ticket": `bitpump_${Date.now()}`});

        if(ticker){
          messages.push( {
            type: 'ticker',
            codes: Object.keys(bucket).map(key =>{
              let market_info = bucket[key];
              let base = market_info.base;
              let quote = market_info.quote;
              return  `${quote}-${base}`; // kRW-BTC
            }),
          });

          // 마켓필터로 인해 BTC가제거된경우 BTC마켓 시세를 위해 추가해야한다.
          if(bucket["BTC"] == null){
            messages[1].codes.push(`KRW-BTC`)
          }
        }

        if(trade){
          messages.push( {
            type: 'trade',
            codes: Object.keys(bucket).map(key =>{
              let market_info = bucket[key];
              let base = market_info.base;
              let quote = market_info.quote;
              return  `${quote}-${base}`; // kRW-BTC
            }),
          });
        }
         
        ws.send(JSON.stringify(messages));
        break;
      case "bithumb":
        ws.send( JSON.stringify({
          type: 'ticker',
          symbols: Object.keys(bucket).map(key =>{
            let market_info = bucket[key];
            let base = market_info.base;
            let quote = market_info.quote;
            return  `${base}_${quote}`;
          }),
          tickTypes: ['24H'], // MID
        }));

        break;
    }

 
  });

  ws.addEventListener('message', (event) => {
    let data = JSON.parse(event.data);
    let { type } = data;
    switch(exchange){
      case "upbit":

        let { code, trade_price, high_price , low_price ,prev_closing_price} = data;
        const base = code.split("-")[1];
        const quote = code.split("-")[0];

        switch(type){
          case "ticker":

            if(code == "KRW-BTC"){
              latest_btc_krw_price = trade_price;
              
              if(init_btc_krw_price ==null){
                init_btc_krw_price = trade_price;
              }else{

                let chg_rate = (trade_price - init_btc_krw_price)/init_btc_krw_price * 100;
                btc_krw_daybefore = (trade_price - prev_closing_price)/prev_closing_price * 100;
             
             
                if(Math.abs(chg_rate) > 0.3){
                  init_btc_krw_price = trade_price;
                  addEventLog(`${colors.green("BTC")} ${chg_rate>0?colors.red(`▲ ${chg_rate.toFixed(2)}%`):colors.blue(`▼ ${chg_rate.toFixed(2)}%`)}`)
                }
              }
            }
  
            if(bucket[base]){
              let market_info = bucket[base];
              market_info.price = trade_price;
              market_info.high = high_price;
              market_info.low = low_price;

              if(high_price_change_object[base] == null){
                high_price_change_object[base] = {
                  trade_price : high_price,
                  timestamp : null
                }
              }else{
                if(high_price_change_object[base].trade_price != high_price){
                  high_price_change_object[base] = {
                    trade_price : high_price,
                    timestamp : Date.now()
                  }
                }
              }

              if(low_price_change_object[base] == null){
                low_price_change_object[base] = {
                  trade_price : low_price,
                  timestamp : null
                }
              }else{
                if(low_price_change_object[base].trade_price != low_price){
                  low_price_change_object[base] = {
                    trade_price : low_price,
                    timestamp : Date.now()
                  }
                }
              }
            }

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
            break;
          case "trade":
            if(bucket[base]){
             
              let market_info = bucket[base];
              //handleTrade(market_info,base, data);

              switch(quote){
                case "BTC":
                  // 원화 비트코인 값이 초기화되지 않으면 BTC마켓은 처리하지 않는다.
                  if(latest_btc_krw_price == null){
                    return;
                  }
                case "KRW":


                  handleTrade2(market_info,base, quote, data);
                  break;
              }
            }

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
            break;
        }
       
        break;
      case "bithumb":
        if(type == "ticker"){
          let { content} = data;
          let { symbol , closePrice}  = content;
          const base = symbol.split("_")[0];

          if(bucket[base]){
            let market_info = bucket[base];
            market_info.price = closePrice;
          }
        }
        break;
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

function getTradeStore(base, trade_history){
  return trade_history.reduce((acc,trade) =>{

    let { code  } = trade;
    const base = code.split("-")[1];
    const quote = code.split("-")[0];

    let trade_price = trade.trade_price *(quote =="BTC"? latest_btc_krw_price : 1);
    let trade_volume = trade.trade_volume
    let ask_bid = trade.ask_bid;
    let volume = trade_price * trade_volume;

    acc.total_volume += volume;

    if(ask_bid == "ASK"){
      acc.sell_volume += volume;
    }else{
      acc.buy_volume += volume;
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
  const formattedNumber = new Intl.NumberFormat('en-US', {
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

  let { timestamp ,trade_price ,trade_volume, ask_bid} = trade

  // n초 이전에 데이터는 삭제한다
  // for (let i = trade_object[base].length - 1; i >= 0; i--) {
  //   const { t } = trade_object[base][i];
  //   if (timestamp - t >= 1000) { 
  //     trade_object[base].splice(i, 1); // i번째 요소 삭제
  //   }
  // }

  for (let i = total_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = total_trade_object[base][i];
    if (timestamp - t >= 1000) { 
      total_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  for (let i = bid_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = bid_trade_object[base][i];
    if (timestamp - t >= 1000) { 
      bid_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  for (let i = ask_trade_object[base].length - 1; i >= 0; i--) {
    const { t } = ask_trade_object[base][i];
    if (timestamp - t >= 1000) { 
      ask_trade_object[base].splice(i, 1); // i번째 요소 삭제
    }
  }

  let trade_price_krw = trade_price *( quote =="BTC"? latest_btc_krw_price : 1);
  let volume_krw = trade_price_krw * trade_volume;

  // 새로운 트레이드 이력 저장
  // trade_object[base].push({
  //   t : timestamp,
  //   v : volume_krw,
  //   ask_bid : ask_bid,
  // })

  total_trade_object[base].push({
    t : timestamp,
    v : volume_krw,
    p : trade_price
  })

  if(ask_bid =="ASK"){
    ask_trade_object[base].push({
      t : timestamp,
      v : volume_krw,
      p : trade_price
    })
  }else{
    bid_trade_object[base].push({
      t : timestamp,
      v : volume_krw,
      p : trade_price
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
      addEventLog(`${base.padEnd(6)} ${colors.red(formatNumber(bid_result.total_volume))}   ${colors.yellow(bid_result.change_rate>0?bid_result.change_rate.toFixed(2)+"%":'')}`,{
        base : base,
        type : "bid",
        volume : bid_result.total_volume,
        change_rate : bid_result.change_rate
      })
    }

    if(ask_result.total_volume >1000000){ // 꼽싸리는 뺴기위해 100만원이상만
      addEventLog(`${base.padEnd(6)} ${colors.blue(formatNumber(ask_result.total_volume))}   ${colors.yellow(ask_result.change_rate>0?ask_result.change_rate.toFixed(2)+"%":'')}`,{
        base : base ,
        type : "ask",
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
        }else{
          // 다른 타입의 알람을 지우고 새로 발생된 알림을 넣고싶으면 여기를 코딩할것 !
        }
      } 
    }

  }


  // if(result.total_volume > EVENT_VOLUME){  // 1초만에 일정금액 한방에 긁음
    
  //   //알림이 발생되면 초기화한다.
  //   trade_object[base] = [];

  //   let total_volume = result.total_volume;
  //   let buy_volume = result.buy_volume;
  //   let sell_volume =result.sell_volume;

  //   let bid = `${((buy_volume/total_volume) * 100).toFixed(0)}%`;
  //   let ask = `${((sell_volume/total_volume) * 100).toFixed(0)}%`;
  //   let content = '';
  //   if(buy_volume >sell_volume){
  //     content = `${colors.red(((total_volume/100000000).toFixed(1))+`B (${bid})`)}`;
  //   }else{
  //     content = `${colors.blue(((total_volume/100000000).toFixed(1))+`B (${ask})`)}`;
  //   }
  //   addEventLog(`[${getHHmmss()}] ${base.padEnd(6)} ${content}`)

  //   if(event_object[base] == null){
  //     event_object[base] = {
  //       timestamp : Date.now(),
  //       type : "volume",
  //       value : total_volume,
  //     }
  //   }else{
  //     // 알림 표시 시간이 지난 이벤트는 새로운 알림 발행
  //     if((Date.now() - event_object[base].timestamp) > EVENT_NOTI_TIME){
  //       event_object[base] = {
  //         timestamp : Date.now(),
  //         type : "volume",
  //         value : total_volume,
  //       }
  //     }else{
  //       // 알림 표시 시간이 안지난 이벤트 인경우 다른 알림이 표시되고있는 상태이면 기다리고 같은 타입이면 누적한다.
  //       if(event_object[base].type =="volume"){ // 같은 타입이면 누적
  //         event_object[base].value += total_volume;
  //       }else{
  //         // 다른 타입의 알람을 지우고 새로 발생된 알림을 넣고싶으면 여기를 코딩할것 !
  //       }
  //     } 
  //   }
   
  // }

  //if(base == "BTC" && trade_object[base]){

    //addEventLog(trade_object[base].length +"")
  //}
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



let latest_time_bucket = {};
let trade_price_bucket = {};
let start_time = null;
function handleTrade2(object, base, quote, trade) {

  let { timestamp ,trade_price , prev_closing_price} = trade

  updatePriceChangeObject(base ,trade_price);
  updateTradeObject(base , quote, trade);

  trade_price_bucket[base] = {
    trade_price : trade_price,
    prev_closing_price : prev_closing_price
  };

  let time_key = getOneMinuteTimeKey(timestamp)

  // 최초 한번 초기화
  if(object.trade_store == undefined){
    object.trade_store = {};
    object.trade_history = [];
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
        delete object.trade_store[time_key]
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

}

let prev_object = {};
let event_object = {};
let trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let total_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let bid_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let ask_trade_object = {}; // 심볼별 특정 정의된 시간초 동안의 trade 이력을 저장한다
let price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let high_price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let low_price_change_object = {}; // 가격 변동시 반짝임 이벤트 발생
let current_bid_ask_object = {}; // 심볼별 최근 bid, ask 값 저장
let latestLogData = [];

async function startVolumeRanker() {
  let bucket = {};
  start_time = Date.now();
  await initMarketInfo(upbitExchange ,['KRW','BTC'], bucket)
  connectWebsocket("upbit", true , true ,bucket);

  setInterval(()=>{
    let result = {};

    for(let base in bucket ){
      let object  = bucket[base];

      //console.log(object);

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

        prev_object[base] = result[base];

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
    let total_volume_sum =0;
    let buy_volume_sum =0;
    let sell_volume_sum =0;
    bases.forEach(base =>{
      let object = result[base];

      // 전체장 통계를
      total_volume_sum += object.total_volume;
      buy_volume_sum += object.buy_volume;
      sell_volume_sum += object.sell_volume;
      
      let row = [null,null,null,null,null,null,null,null]
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
      
      row[COLUM_QUOTE] = object.quote == "KRW"?`${colors.red(object.quote)}`:`${colors.blue(object.quote)}`;
      
      let changeRate = 0;
      if(trade_price_bucket[base]){
        let {trade_price , prev_closing_price} = trade_price_bucket[base];
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
      //}
      i++;
    })

    let total_buy = parseInt(((buy_volume_sum/total_volume_sum) * 100));
    let total_sell = parseInt(((sell_volume_sum/total_volume_sum) * 100));

    latestLogData = logData;
    updateBuySell(total_buy,total_sell , total_volume_sum)
    updateTable(logData);
    updateEventLogs();


    if(select_base){
      
      //addEventLog(select_base)
      line_chart.setLabel(`${colors.yellow(select_base)} Buy/Sell History`)
      let trade_store =  bucket[select_base]?.trade_store;

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

        
        line_chart.show();
      

        // if(toggle_chart){
        
        // }else{
         
        // }
      }else{
        //bar_chart.hide();
        //line_chart.hide();
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
  return number.toLocaleString('en-US', { maximumFractionDigits: 0 });
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


var spark1 = [1,2,5,2,1,5,1,2,5,2,1,5,4,4,5,4,1,5,1,2,5,2,1,5,1,2,5,2,1,5,1,2,5,2,1,5]
var spark2 = [4,4,5,4,1,5,1,2,5,2,1,5,4,4,5,4,1,5,1,2,5,2,1,5,1,2,5,2,1,5,1,2,5,2,1,5]
//set dummy data on bar chart
function refreshSpark() {
  spark1.shift()
  spark1.push(Math.random()*5+50)         
  bar_chart.setData(['Server1'], [spark1])  
}

let screen;
let select_base = null;
let toggle_chart = true;
let data_table , info_box , info_box2, event_log, store_progress, buy_sell_progress, line_chart , bar_chart; 

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
      select_base = latestLogData[index-1][COLUM_BASE];
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
  // bar_chart =  grid.set(6, 9, 4, 3, contrib.sparkline, 
  //   { label: 'Throughput (bits/sec)'
  //   , tags: true
  //   , style: { fg: 'blue', titleFg: 'white' }})

  // bar_chart.hide();
    

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

const readline = require('readline');
const { log } = require('console');

// 수집 시간 입력 함수
function getCollectionTime() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('거래량 누적 시간(분) 입력해주세요. (Enter : 60분): ', (answer) => {
      rl.close();
      resolve(parseInt(answer) || 60); // 입력이 없을 경우 60을 기본값으로 설정
    });
  });
}

// 코인 리스트 숫자 입력 함수
// function getCoinListNumber() {
//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   return new Promise((resolve) => {
//     rl.question('리스트에 표시할 코인 갯수를 입력해주세요. (Enter : 100개): ', (answer) => {
//       rl.close();
//       resolve(parseInt(answer) || 100); // 입력이 없을 경우 30을 기본값으로 설정
//     });
//   });
// }


// 코인 리스트 숫자 입력 함수
function getCoinMarket() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const options = [
    "전체 마켓",
    "KRW 마켓",
    "BTC 마켓"
  ];

  return new Promise((resolve) => {
    console.log("### 마켓 리스트 ###");
    options.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });

    rl.question('거래량을 누적할 마켓의 번호를 선택해주세요.  (Enter : (1)전체 마켓): ', (answer) => {
      rl.close();
      const selectedOption = parseInt(answer);
      if (selectedOption >= 1 && selectedOption <= options.length) {
        resolve(selectedOption);
      } else {
        resolve("ALL"); // Return "ALL" if an invalid option is selected
      }
    });
  });
}


function getEventVolumeValue() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('거래량 이벤트 발생 거래대금 값을 숫자를(1~N) 입력해주세요 [단위: 천만원] (Enter : (3)천만원): ', (answer) => {
      rl.close();
      resolve(parseInt(answer) || 3); // 입력이 없을 경우 30을 기본값으로 설정
    });
  });
}


// 조건 입력 받기
async function getConditions() {
  
  console.log('##########################################################');
  console.log('########### Bitpump Volume Monitor Setting ###############');
  console.log('##########################################################');

  //const coinListNumber = await getCoinListNumber();

  // const collectionTime = await getCollectionTime();
  // const coinMarket = await getCoinMarket();
  // const eventVoluem = await getEventVolumeValue();

  // SUM_MINUTE = collectionTime;
  // FILTER_MARKET=  coinMarket;
  // EVENT_VOLUME = eventVoluem * 10000000;

  const config = require('./config.js');

  let {collection_time , filter_market , event_volume , event_log_save_timeout} = config;
  collection_time_ = collection_time;
  filter_market_=  filter_market;
  event_volume_ = event_volume * 10000000;
  event_log_save_timeout_ = event_log_save_timeout;
 
  // UI 초기화
  initUI();
  // 1. 수집시간 , 시작시간 표시
  //updateInfoBox(`${getTime(Date.now())}`);
  //screen.render();
  startVolumeRanker().catch((error) => console.error(error));
}

function updateInfoBox(content){
  info_box.content = content;
}

// function updateInfoBox2(content){
//   info_box2.content = content;
// }

function updateProgress(progress){
  store_progress.setData([progress]);
}
const logEntries = [];
function addEventLog(log , meta){
  //event_log.log(log)  
  logEntries.unshift({
    content : `[${getHHmmss()}] ${log}`,
    timestamp : Date.now(),
    meta : meta
  }); // Add the new entry to the beginning of the array

  //if (logEntries.length > 200) {
  //  logEntries.pop(); // Remove the last entry from the array
  //}
  //sound(ROCKET_SOUND_PATH);
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
    if(meta && meta?.type == "bid" || meta?.type == "ask" ){
      let {base , type, volume} = meta;
      switch(type){
        case "bid":
          if(bid[base]  == null){
            bid[base] = volume
          }else{
            bid[base] += volume
          }
          break;
        case "ask":
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
  data_table.setLabel(` ${collection_time_}-Min Upbit Volume List ${getTime(Date.now())}, Progress: ${progress<100?progress.toFixed(2):100}%`)
  data_table.setData({
    headers: ['Idx', 'Base', 'Quote','ChgRate','Price','High','Low','(Buy:Sell)',`Volume`,`${collection_time_}min(%)`,'Event'],
    data: [
      ...[['','','','','','','','','',''],
      ...table_data]
    ],
  });
  //screen.render();
}
// 조건 입력 받기 시작
getConditions();
