module.exports = {

    upbit : {
      // 수집 시간(분) 설정 , 분(min) 단위 설정
      collection_time : 60, 

      // 전체마켓(1) , KRW 마켓(2), BTC 마켓(3)
      filter_market : 1,

      // 이벤트 발생 거래대금 단위(천만원) 
      event_volume : 3,
      // 우측 이벤트 발생 이력을 저장하는 시간(분)입니다. // '분'단위
      // '5'로 설정할 시 최근 5분의 이벤트 이력만 저장합니다
      // 해당 이벤트 로그 값으로 N분 매수/매도 거래량 순위의 심볼을 추출합니다
      event_log_save_timeout : 5,

      // 리스트에서 제외할 심볼 선택 
      exclude_symbols : ["BTT"]
    },

    bithumb : {
      collection_time : 60, 
      // 전체마켓(1) , KRW 마켓(2), BTC 마켓(3)
      filter_market : 1,
      event_volume : 3,
      event_log_save_timeout : 5,
      exclude_symbols : []
    },

    binance : {
      collection_time : 60, 
      // ********* 해외거래소는 필터를 지원하지 않음
      filter_market : -1, 
      event_volume : 3,
      event_log_save_timeout : 5,
      exclude_symbols : ["USDC","BUSD","TUSD"]
    },

    binanceusdm : {
      collection_time : 60, 
      // ********* 해외거래소는 필터를 지원하지 않음
      filter_market : -1, 
      event_volume : 50, // 5억
      event_log_save_timeout : 5,
      exclude_symbols : ["USDC","BUSD","TUSD"]
    },
  
    gateio : {
      collection_time : 60, 
      // ********* 해외거래소는 필터를 지원하지 않음
      filter_market : -1, 
      event_volume : 3,
      event_log_save_timeout : 5,
      exclude_symbols : ["USDC","BUSD","TUSD"]
    }
  };