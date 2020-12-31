const id = SpreadsheetApp.getActiveSpreadsheet().getId()

const onOpen = e => {
    SpreadsheetApp
        .getUi()
        .createAddonMenu()
        .addItem('スクレイピング実行', 'main')
        .addItem('翻訳', 'trans')
        .addToUi()
}

const main = () => {
    const start_time = new Date();
    const data = SpreadSheetsSQL.open(id, 'comolib').select(['No.', 'url', 'flg']).filter('url > NULL AND flg = NULL').result()
    let content = $ = url = ''
    let res = []
    for (let i in data) {
        if (isStop(start_time)) {
            // 未処理件数があるため1分後にトリガーセット．
            ScriptApp.newTrigger('main').timeBased().after(60 * 1000).create()
            break
        }

        try {
            content = UrlFetchApp.fetch(data[i]['url']).getContentText()
            $ = Cheerio.load(content)
            res = seek($)
            url = $('link[rel="next"]').attr('href')
            while (url !== undefined) {
                content = UrlFetchApp.fetch(url).getContentText()
                $ = Cheerio.load(content)
                res = [...res, ...seek($)]
                url = $('link[rel="next"]').attr('href')
                Utilities.sleep(3000);
            }

            res = filter(res)
            if (0 < res.length) {
                SpreadSheetsSQL.open(id, 'comolib_data').insertRows(res)
            }

            SpreadSheetsSQL.open(id, 'comolib').updateRows({flg: '1'}, `url = ${data[i]['url']}`)
            Utilities.sleep(3000);
        } catch (e) {
            console.error(e.message)
        }
    }
}

const seek = $ => {
    const jsons = $('script[type="application/ld+json"]').map((i, v) => $(v).html()).get().filter((v, i) => i !== 0).map(e => JSON.parse(e))
    return jsons[1].filter((v, i) => i !== 0).map(e => {
        return {
            'No.': '=row()-1',
            url: jsons[1][0]['mainEntityOfPage']['@id'],
            title: $('#feature-detail > article > header > h1').text(),
            area: jsons[0]['itemListElement'][2]['item']['name'],
            pref: jsons[0]['itemListElement'][3]['item']['name'],
            name: e.name,
            address: e.address,
            description: e.description,
            tel: e.telephone,
            latitude: e.geo.latitude,
            longitude: e.geo.longitude
        }
    }).filter(e => e !== undefined)
}

const filter = data => {
    const res = SpreadSheetsSQL.open(id, 'comolib_data').select(['tel']).filter(`tel IN ${data.map(e => e.tel).join(',')}`).result()
    return data.filter(e => res.every(f => f.tel != e.tel))
}

const isStop = (start_time) => {
    const current_time = new Date();
    //5分を超えたらGASの自動停止を回避するべく終了処理に移行する.
    return 5 <= (current_time.getTime() - start_time.getTime()) / (1000 * 60)
}

const trans = () => {
    const start_time = new Date();
    const sql = SpreadSheetsSQL.open(id, 'comolib_data')
    const data = sql.select(['No.', 'description', 'trans']).filter('trans = NULL').result()
    for (let i in data) {
        if (isStop(start_time)) {
            // 未処理件数があるため1分後にトリガーセット．
            ScriptApp.newTrigger('trans').timeBased().after(60 * 1000).create()
            break
        }
        let text = LanguageApp.translate(data[i]['description'], 'ja', 'en')
        text = LanguageApp.translate(text, 'en', 'ko')
        text = LanguageApp.translate(text, 'ko', 'ja')
        sql.updateRows({trans: text}, `No. = ${data[i]['No.']}`)
    }
}