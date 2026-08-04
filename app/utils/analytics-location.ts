type NullableLocationPart = string | null | undefined

const countryAliases: Record<string, string> = {
	'china': '中国',
	'people s republic of china': '中国',
	'usa': '美国',
	'united states': '美国',
	'united states of america': '美国',
	'japan': '日本',
	'south korea': '韩国',
	'korea': '韩国',
	'singapore': '新加坡',
	'canada': '加拿大',
	'australia': '澳大利亚',
	'united kingdom': '英国',
	'uk': '英国',
	'france': '法国',
	'germany': '德国',
	'india': '印度',
	'russia': '俄罗斯',
}

const regionAliases: Record<string, string> = {
	// 中国省级行政区
	'cn:anhui': '安徽省',
	'cn:beijing': '北京市',
	'cn:chongqing': '重庆市',
	'cn:fujian': '福建省',
	'cn:gansu': '甘肃省',
	'cn:guangdong': '广东省',
	'cn:guangxi': '广西壮族自治区',
	'cn:guizhou': '贵州省',
	'cn:hainan': '海南省',
	'cn:hebei': '河北省',
	'cn:heilongjiang': '黑龙江省',
	'cn:henan': '河南省',
	'cn:hong kong': '香港特别行政区',
	'cn:hubei': '湖北省',
	'cn:hunan': '湖南省',
	'cn:inner mongolia': '内蒙古自治区',
	'cn:jiangsu': '江苏省',
	'cn:jiangxi': '江西省',
	'cn:jilin': '吉林省',
	'cn:liaoning': '辽宁省',
	'cn:macao': '澳门特别行政区',
	'cn:macau': '澳门特别行政区',
	'cn:ningxia': '宁夏回族自治区',
	'cn:qinghai': '青海省',
	'cn:shaanxi': '陕西省',
	'cn:shandong': '山东省',
	'cn:shanghai': '上海市',
	'cn:shanxi': '山西省',
	'cn:sichuan': '四川省',
	'cn:taiwan': '台湾省',
	'cn:tianjin': '天津市',
	'cn:tibet': '西藏自治区',
	'cn:xinjiang': '新疆维吾尔自治区',
	'cn:yunnan': '云南省',
	'cn:zhejiang': '浙江省',

	// 美国州级行政区
	'us:alabama': '阿拉巴马州',
	'us:alaska': '阿拉斯加州',
	'us:arizona': '亚利桑那州',
	'us:arkansas': '阿肯色州',
	'us:california': '加利福尼亚州',
	'us:colorado': '科罗拉多州',
	'us:connecticut': '康涅狄格州',
	'us:delaware': '特拉华州',
	'us:florida': '佛罗里达州',
	'us:georgia': '佐治亚州',
	'us:hawaii': '夏威夷州',
	'us:idaho': '爱达荷州',
	'us:illinois': '伊利诺伊州',
	'us:indiana': '印第安纳州',
	'us:iowa': '艾奥瓦州',
	'us:kansas': '堪萨斯州',
	'us:kentucky': '肯塔基州',
	'us:louisiana': '路易斯安那州',
	'us:maine': '缅因州',
	'us:maryland': '马里兰州',
	'us:massachusetts': '马萨诸塞州',
	'us:michigan': '密歇根州',
	'us:minnesota': '明尼苏达州',
	'us:mississippi': '密西西比州',
	'us:missouri': '密苏里州',
	'us:montana': '蒙大拿州',
	'us:nebraska': '内布拉斯加州',
	'us:nevada': '内华达州',
	'us:new hampshire': '新罕布什尔州',
	'us:new jersey': '新泽西州',
	'us:new mexico': '新墨西哥州',
	'us:new york': '纽约州',
	'us:north carolina': '北卡罗来纳州',
	'us:north dakota': '北达科他州',
	'us:ohio': '俄亥俄州',
	'us:oklahoma': '俄克拉何马州',
	'us:oregon': '俄勒冈州',
	'us:pennsylvania': '宾夕法尼亚州',
	'us:rhode island': '罗得岛州',
	'us:south carolina': '南卡罗来纳州',
	'us:south dakota': '南达科他州',
	'us:tennessee': '田纳西州',
	'us:texas': '得克萨斯州',
	'us:utah': '犹他州',
	'us:vermont': '佛蒙特州',
	'us:virginia': '弗吉尼亚州',
	'us:washington': '华盛顿州',
	'us:west virginia': '西弗吉尼亚州',
	'us:wisconsin': '威斯康星州',
	'us:wyoming': '怀俄明州',
	'us:district of columbia': '哥伦比亚特区',
}

const cityAliases: Record<string, string> = {
	'beijing': '北京市',
	'shanghai': '上海市',
	'tianjin': '天津市',
	'chongqing': '重庆市',
	'guangzhou': '广州市',
	'shenzhen': '深圳市',
	'hangzhou': '杭州市',
	'nanjing': '南京市',
	'suzhou': '苏州市',
	'ningbo': '宁波市',
	'wenzhou': '温州市',
	'chengdu': '成都市',
	'wuhan': '武汉市',
	'changsha': '长沙市',
	'zhengzhou': '郑州市',
	'xi an': '西安市',
	'xian': '西安市',
	'jinan': '济南市',
	'qingdao': '青岛市',
	'xiamen': '厦门市',
	'fuzhou': '福州市',
	'hefei': '合肥市',
	'nanchang': '南昌市',
	'kunming': '昆明市',
	'guiyang': '贵阳市',
	'nanning': '南宁市',
	'haikou': '海口市',
	'sanya': '三亚市',
	'shenyang': '沈阳市',
	'dalian': '大连市',
	'changchun': '长春市',
	'harbin': '哈尔滨市',
	'shijiazhuang': '石家庄市',
	'taiyuan': '太原市',
	'hohhot': '呼和浩特市',
	'lanzhou': '兰州市',
	'xining': '西宁市',
	'yinchuan': '银川市',
	'urumqi': '乌鲁木齐市',
	'lhasa': '拉萨市',
	'dongguan': '东莞市',
	'foshan': '佛山市',
	'zhuhai': '珠海市',
	'hong kong': '香港',
	'macao': '澳门',
	'macau': '澳门',
	'taipei': '台北市',
	'kaohsiung': '高雄市',
	'san francisco': '旧金山',
	'los angeles': '洛杉矶',
	'new york': '纽约',
	'seattle': '西雅图',
	'chicago': '芝加哥',
	'washington': '华盛顿',
	'boston': '波士顿',
	'miami': '迈阿密',
	'dallas': '达拉斯',
	'houston': '休斯敦',
	'london': '伦敦',
	'paris': '巴黎',
	'tokyo': '东京',
	'osaka': '大阪',
	'seoul': '首尔',
	'singapore': '新加坡',
	'bangkok': '曼谷',
	'sydney': '悉尼',
	'melbourne': '墨尔本',
	'toronto': '多伦多',
	'vancouver': '温哥华',
	'moscow': '莫斯科',
	'berlin': '柏林',
	'amsterdam': '阿姆斯特丹',
	'dubai': '迪拜',
	'mumbai': '孟买',
}

let chineseRegionNames: Intl.DisplayNames | null | undefined

function normalizeLookupKey(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase('en-US')
		.normalize('NFKD')
		.replace(/[’']/gu, ' ')
		.replace(/[^a-z0-9]+/gu, ' ')
		.trim()
		.replace(/\s+/gu, ' ')
}

function cleaned(value: NullableLocationPart): string | null {
	const result = value?.trim()
	return result || null
}

function countryCode(value: NullableLocationPart): string | null {
	const result = cleaned(value)
	return result && /^[a-z]{2}$/iu.test(result) ? result.toUpperCase() : null
}

function countryDisplayNames(): Intl.DisplayNames | null {
	if (chineseRegionNames !== undefined)
		return chineseRegionNames
	try {
		chineseRegionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
	}
	catch {
		chineseRegionNames = null
	}
	return chineseRegionNames
}

export function localizeAnalyticsCountry(country: NullableLocationPart): string | null {
	const value = cleaned(country)
	if (!value)
		return null
	const code = countryCode(value)
	if (code) {
		try {
			return countryDisplayNames()?.of(code) || code
		}
		catch {
			return code
		}
	}
	return countryAliases[normalizeLookupKey(value)] || value
}

export function localizeAnalyticsRegion(country: NullableLocationPart, region: NullableLocationPart): string | null {
	const value = cleaned(region)
	if (!value)
		return null
	const key = normalizeLookupKey(value)
	const code = countryCode(country)
	return (code ? regionAliases[`${code.toLocaleLowerCase('en-US')}:${key}`] : null)
		|| regionAliases[`cn:${key}`]
		|| regionAliases[`us:${key}`]
		|| value
}

export function localizeAnalyticsCity(_country: NullableLocationPart, city: NullableLocationPart): string | null {
	const value = cleaned(city)
	if (!value)
		return null
	return cityAliases[normalizeLookupKey(value)] || value
}

export function formatAnalyticsLocation(
	country: NullableLocationPart,
	region: NullableLocationPart,
	city: NullableLocationPart,
): string {
	const parts = [
		localizeAnalyticsCountry(country),
		localizeAnalyticsRegion(country, region),
		localizeAnalyticsCity(country, city),
	].filter((part): part is string => Boolean(part))
	const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index)
	return uniqueParts.join(' · ') || '未知地区'
}
