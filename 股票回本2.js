// 用于存储当天已涨停或回本的股票
const TODAY = new Date().toLocaleDateString('zh-CN')
const STORAGE_KEY = `stock_status_${TODAY}`

// 获取或初始化今日股票状态
function getTodayStockStatus() {
  const today = new Date().toLocaleDateString('zh-CN')
  let stored = {}
  try {
    stored = JSON.parse(Pasteboard.paste() || '{}')
    // 严格检查日期是否相同
    if (stored.date !== today) {
      console.log(`[${new Date().toLocaleString()}] 日期不匹配，重置缓存`)
      stored = { date: today, cached: {} }
    }
  } catch (e) {
    console.log(`[${new Date().toLocaleString()}] 解析缓存失败，重置缓存`)
    stored = { date: today, cached: {} }
  }
  return stored
}

// 保存今日股票状态
function saveTodayStockStatus(status) {
  Pasteboard.copy(JSON.stringify(status))
}

// 配置信息
const MY_STOCKS = [
  { code: "sz300757", cost: 210 }, // 罗博特科
  { code: "bj430510", cost: 23.697 }, // 丰光精密
  { code: "sh600657", cost: 5.165 }, // 信达地产
  { code: "bj831832", cost: 32.437 }, // 科达自控
  { code: "bj832522", cost: 66.677 }, // 纳克若尔
  { code: "sz000099", cost: 27.201 }, // 中信海直
  { code: "sz300547", cost: 37.368 }, // 川环科技
  { code: "sz002194", cost: 13.8 }, // 武汉凡谷
  { code: "sz300364", cost: 27.208 }, // 中文在线
  { code: "sz000415", cost: 3.91}, // 渤海租赁
  { code: "sz002130", cost: 24.912}, // 沃尔核材
  { code: "sz002241", cost: 30}, // 歌尔股份
]

// 获取股票名称映射
function getStockName(code) {
  const stockMap = {
    'sz300757': '罗博特科',
    'bj430510': '丰光精密',
    'sh600657': '信达地产',
    'bj831832': '科达自控',
    'bj832522': '纳克若尔',
    'sz000099': '中信海直',
    'sz300547': '川环科技',
    'sz002194': '武汉凡谷',
    'sz300364': '中文在线',
    'sz000415': '渤海租赁',
    'sz002130': '沃尔核材',
    'sz002241': '歌尔股份',
  }
  return stockMap[code] || code
}

// 根据不同板块判断涨停标准
function getLimitUpThreshold(stockCode) {
  if (stockCode.startsWith('sz300') || stockCode.startsWith('sh688')) {
    return 19.9; // 创业板和科创板 20%
  } else if (stockCode.startsWith('bj')) {
    return 29.9; // 北交所 30%
  } else {
    return 9.9; // 主板 10%
  }
}

// 获取股票数据
async function fetchStockData(code) {
  const status = getTodayStockStatus()
  
  // 检查是否已缓存（涨停或回本）
  if (status.cached[code]) {
    const reason = status.cached[code].isLimitUp ? "涨停" : "回本"
    console.log(`[${new Date().toLocaleString()}] ${code} 今日已${reason}，使用缓存数据`)
    return status.cached[code]
  }
  
  console.log(`[${new Date().toLocaleString()}] 开始获取数据：${code}`)
  
  const url = `https://hq.sinajs.cn/list=${code}`
  const request = new Request(url)
  request.headers = {
    "Referer": "https://finance.sina.com.cn",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)",
    "Accept-Language": "zh-CN,zh;q=0.9"
  }
  
  const response = await request.loadString()
  const data = response.split('="')[1].split(',')
  const price = parseFloat(data[3])
  const preClose = parseFloat(data[2])
  const name = getStockName(code)
  const changePercent = ((price - preClose) / preClose * 100).toFixed(2)
  
  const stockData = {
    name: name,
    price: price,
    pre_close: preClose,
    change_percent: changePercent
  }
  
  // 检查是否涨停或回本
  const limitUpThreshold = getLimitUpThreshold(code);
  console.log(`[${new Date().toLocaleString()}] ${code} 涨跌幅: ${changePercent}%, 涨停阈值: ${limitUpThreshold}%`)
  const isLimitUp = parseFloat(changePercent) >= limitUpThreshold;
  
  const isBreakEven = MY_STOCKS.find(s => s.code === code)?.cost <= price
  
  // 如果涨停或回本，缓存数据
  if (isLimitUp || isBreakEven) {
    const reason = isLimitUp ? "涨停" : "回本"
    console.log(`[${new Date().toLocaleString()}] ${code} ${reason}，缓存数据`)
    stockData.isLimitUp = isLimitUp  // 记录缓存原因
    status.cached[code] = stockData
    saveTodayStockStatus(status)
  }
  
  return stockData
}

// 判断是否为交易时间
function isTradeTime() {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const minute = now.getMinutes()
  
  // 周末不交易
  if (day === 0 || day === 6) {
    return false
  }
  
  // 判断是否在交易时段
  // 上午：9:30 - 11:30
  // 下午：13:00 - 15:00
  if ((hour === 9 && minute >= 30) || 
      hour === 10 || 
      (hour === 11 && minute <= 30) ||
      (hour === 13) || 
      (hour === 14)) {
    return true
  }
  
  return false
}

function getRefreshInterval() {
  if (!isTradeTime()) {
    const now = new Date()
    const nextTradeDay = new Date(now)
    
    // 如果现在是周五下午3点后，设置到下周一早上9:25
    if (now.getDay() === 5 && (now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 0))) {
      nextTradeDay.setDate(now.getDate() + 3)
      nextTradeDay.setHours(9, 25, 0, 0)
    }
    // 如果是周末，设置到下周一早上9:25
    else if (now.getDay() === 0) {
      nextTradeDay.setDate(now.getDate() + 1)
      nextTradeDay.setHours(9, 25, 0, 0)
    }
    else if (now.getDay() === 6) {
      nextTradeDay.setDate(now.getDate() + 2)
      nextTradeDay.setHours(9, 25, 0, 0)
    }
    // 如果是工作日非交易时间，设置到当天或下一个工作日早上9:25
    else {
      if (now.getHours() >= 15) {
        nextTradeDay.setDate(now.getDate() + 1)
      }
      nextTradeDay.setHours(9, 25, 0, 0)
    }
    
    return nextTradeDay.getTime() - now.getTime()
  }
  
  // 交易时间每2分钟刷新一次
  return 2 * 60 * 1000
}

// 创建小组件
async function createWidget() {
  console.log(`[${new Date().toLocaleString()}] 开始创建小组件`)
  
  let widget = new ListWidget()
  widget.backgroundColor = new Color("#1A1A1A")
  widget.setPadding(10, 12, 10, 12)
  
  // 修改这里的刷新间隔逻辑
  widget.refreshAfterDate = new Date(Date.now() + getRefreshInterval())
  
  // 添加一个点击动作，用于手动刷新
  widget.url = "scriptable:///run/" + Script.name()
  
  try {
    console.log(`[${new Date().toLocaleString()}] 获取上证指数数据`)
    const indexData = await fetchStockData("sh000001")
    console.log(`[${new Date().toLocaleString()}] 上证指数: ${indexData.price}, 涨跌幅: ${indexData.change_percent}%`)
    
    console.log(`[${new Date().toLocaleString()}] 开始获取所有股票数据`)
    const stocksData = await Promise.all(
      MY_STOCKS.map(stock => fetchStockData(stock.code))
    )

    const titleRow = widget.addStack()
    titleRow.layoutHorizontally()
    titleRow.bottomAlignContent()
    addBoldText(titleRow, "上证指数", Color.white(), 15)
    titleRow.addSpacer(4)
    const indexChange = parseFloat(indexData.change_percent)
    addText(titleRow, getChangeText(indexChange), getChangeColor(indexChange), 12)
    
    widget.addSpacer(4)
    
    const indexPrice = indexData.price
    const priceText = widget.addText(`${indexPrice.toFixed(2)}`)
    priceText.textColor = getChangeColor(indexChange)
    priceText.font = Font.boldRoundedSystemFont(24)
    
    widget.addSpacer(23)
    
    const mainRow = widget.addStack()
    mainRow.layoutHorizontally()
    mainRow.centerAlignContent()
    mainRow.addSpacer()
    
    const row = mainRow.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.spacing = 30
    
    // 回本数据
    console.log(`[${new Date().toLocaleString()}] 计算回本数据`)
    const breakEvenColumn = row.addStack()
    breakEvenColumn.layoutVertically()
    breakEvenColumn.centerAlignContent()
    const breakEvenTitle = breakEvenColumn.addStack()
    breakEvenTitle.addSpacer()
    addBoldText(breakEvenTitle, "回本", Color.white(), 13)
    breakEvenTitle.addSpacer()
    breakEvenColumn.addSpacer(4)
    const breakEvenCount = stocksData.filter((stock, i) => {
      const isBreakEven = stock.price >= MY_STOCKS[i].cost
      if (isBreakEven) {
        console.log(`[${new Date().toLocaleString()}] 发现回本: ${stock.name}, 当前价=${stock.price}, 成本价=${MY_STOCKS[i].cost}`)
      }
      return isBreakEven
    }).length
    console.log(`[${new Date().toLocaleString()}] 回本数量: ${breakEvenCount}`)
    
    const breakEvenNum = breakEvenColumn.addStack()
    breakEvenNum.addSpacer()
    const beText = breakEvenNum.addText(`${breakEvenCount}`)
    beText.textColor = Color.white()
    beText.font = Font.boldSystemFont(20)
    breakEvenNum.addSpacer()
    
    // 涨停数据
    console.log(`[${new Date().toLocaleString()}] 计算涨停数据`)
    const limitUpColumn = row.addStack()
    limitUpColumn.layoutVertically()
    limitUpColumn.centerAlignContent()
    const limitUpTitle = limitUpColumn.addStack()
    limitUpTitle.addSpacer()
    addBoldText(limitUpTitle, "涨停", Color.white(), 13)
    limitUpTitle.addSpacer()
    limitUpColumn.addSpacer(4)
    const limitUpCount = stocksData.filter((stock, i) => {
      const code = MY_STOCKS[i].code
      const limitUpThreshold = getLimitUpThreshold(code)
      const isLimitUp = parseFloat(stock.change_percent) >= limitUpThreshold
      if (isLimitUp) {
        console.log(`[${new Date().toLocaleString()}] 发现涨停: ${stock.name}, 涨跌幅=${stock.change_percent}%, 涨停阈值=${limitUpThreshold}%`)
      }
      return isLimitUp
    }).length
    console.log(`[${new Date().toLocaleString()}] 涨停数量: ${limitUpCount}`)
    
    const limitUpNum = limitUpColumn.addStack()
    limitUpNum.addSpacer()
    const luText = limitUpNum.addText(`${limitUpCount}`)
    luText.textColor = Color.white()
    luText.font = Font.boldSystemFont(20)
    limitUpNum.addSpacer()
    
    mainRow.addSpacer()

  } catch (error) {
    console.log(`[${new Date().toLocaleString()}] 错误: ${error.message}`)
    addText(widget, `错误: ${error.message}`, Color.red())
  }

  console.log(`[${new Date().toLocaleString()}] 小组件创建完成`)
  return widget
}

function addText(container, text, color, size = 13) {
  const t = container.addText(text)
  t.textColor = color
  t.font = Font.systemFont(size)
  return t
}

function addBoldText(container, text, color, size = 13) {
  const t = container.addText(text)
  t.textColor = color
  t.font = Font.boldSystemFont(size)
  return t
}

function getChangeText(change) {
  return `${change >= 0 ? '+' : ''}${change}%`
}

function getChangeColor(change) {
  return parseFloat(change) >= 0 ? Color.red() : Color.green()
}

// 运行小组件
if (config.runsInWidget) {
  Script.setWidget(await createWidget())
} else {
  const widget = await createWidget()
  await widget.presentMedium()
}

console.log(`[${new Date().toLocaleString()}] 脚本执行完成`)
Script.complete()

