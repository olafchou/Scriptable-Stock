// 用于存储当天已涨停或回本的股票
const TODAY = new Date().toLocaleDateString('zh-CN')
const STORAGE_KEY = `stock_status_${TODAY}`

// 获取或初始化今日股票状态
function getTodayStockStatus() {
  let stored = {}
  try {
    stored = JSON.parse(Pasteboard.paste() || '{}')
    // 如果存储的不是今天的数据，重置
    if (stored.date !== TODAY) {
      stored = { date: TODAY, cached: {} }  // cached用于存储涨停或回本的股票
    }
  } catch (e) {
    stored = { date: TODAY, cached: {} }
  }
  return stored
}

// 保存今日股票状态
function saveTodayStockStatus(status) {
  Pasteboard.copy(JSON.stringify(status))
}

// 配置信息
const MY_STOCKS = [
  { code: "sh600061", cost: 8.225 }, // 国投资本
  { code: "sh600211", cost: 40.626 }, // 西藏药业
  { code: "sz300663", cost: 23.921 }, // 科蓝软件
  { code: "sz300212", cost: 29.152 }, // 易华录
  { code: "sz000878", cost: 13.709 }, // 云南铜业
  { code: "sh600685", cost: 25.091 }, // 中船防务
  { code: "sz000831", cost: 31.089 }, // 中国稀土
  { code: "sh600657", cost: 5.33 }, // 信达地产
  { code: "sz300341", cost: 25.167 }, // 麦克奥迪
  { code: "sz300366", cost: 12.971 }, // 创意信息
  { code: "sz300337", cost: 15.741 }, // 银邦股份
  { code: "sz002837", cost: 40.66 }, // 英维克
  { code: "sz002273", cost: 25 }, // 水晶光电
  { code: "sh601608", cost: 4.508 }, // 中信重工
  { code: "sh603650", cost: 41.8}, // 彤程新材
  { code: "sz300547", cost:20.578 }, // 川环科技
  { code: "sh512480", cost: 1.125 }, // 半导体ETF
  { code: "sh561910", cost: 0.549 }, // 电池ETF
]

// 获取股票名称映射
function getStockName(code) {
  const stockMap = {
    'sh600061': '国投资本',
    'sh600211': '西藏药业',
    'sz300663': '科蓝软件',
    'sz300212': '易华录',
    'sz000878': '云南铜业',
    'sh600685': '中船防务',
    'sz000831': '中国稀土',
    'sh600657': '信达地产',
    'sz300341': '麦克奥迪',
    'sz300366': '创意信息',
    'sz300337': '银邦股份',
    'sz002837': '英维克',
    'sz002273': '水晶光电',
    'sh601608': '中信重工',
    'sh603650': '彤程新材',
    'sz300547': '川环科技',
    'sh512480': '半导体ETF',
    'sh561910': '电池ETF',
    'sh000001': '上证指数'
  }
  return stockMap[code] || code
}

// 获取股票数据
async function fetchStockData(code) {
  const status = getTodayStockStatus()
  
  // 如果股票今天已经涨停或回本，直接返回缓存的数据
  if (status.cached[code]) {
    console.log(`[${new Date().toLocaleString()}] ${code} 今日已涨停或回本，使用缓存数据`)
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
  const isLimitUp = parseFloat(changePercent) >= 9.9
  const isBreakEven = MY_STOCKS.find(s => s.code === code)?.cost <= price
  
  // 如果涨停或回本，缓存数据
  if (isLimitUp || isBreakEven) {
    const reason = isLimitUp ? "涨停" : "回本"
    console.log(`[${new Date().toLocaleString()}] ${code} ${reason}，缓存数据`)
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
    // 非交易时间返回一个很大的数值，实际上相当于不刷新
    return 365 * 24 * 60 * 60 * 1000  // 一年，实际上相当于不刷新
  }
  
  // 交易时间每2分钟刷新一次
  return 2 * 60 * 1000
}

// 创建小组件
async function createWidget() {
  console.log(`[${new Date().toLocaleString()}] 开始创建小组件`)
  
  let widget = new ListWidget()
  
  // 只在交易时间获取数据和刷新
  if (!isTradeTime()) {
    console.log(`[${new Date().toLocaleString()}] 非交易时间，不刷新数据`)
    widget.backgroundColor = new Color("#1A1A1A")
    widget.setPadding(10, 12, 10, 12)
    addBoldText(widget, "非交易时间", Color.white(), 15)
    return widget
  }
  
  widget.refreshAfterDate = new Date(Date.now() + getRefreshInterval())
  
  widget.backgroundColor = new Color("#1A1A1A")
  widget.setPadding(10, 12, 10, 12)

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
    const limitUpCount = stocksData.filter(stock => {
      const isLimitUp = parseFloat(stock.change_percent) >= 9.9
      if (isLimitUp) {
        console.log(`[${new Date().toLocaleString()}] 发现涨停: ${stock.name}, 涨跌幅=${stock.change_percent}%`)
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
