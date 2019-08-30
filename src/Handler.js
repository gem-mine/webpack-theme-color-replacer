'use strict'
var fs = require('fs')
var AssetsExtractor = require('./AssetsExtractor')
var { ConcatSource } = require('webpack-sources')

module.exports = class Handler {
    constructor(options) {
        // Default options
        this.options = Object.assign(
            {
                matchColors: [],
                isJsUgly: !(process.env.NODE_ENV === 'development' || process.argv.find(arg => arg.match(/\bdev/)))
            },
            options
        )
        this.assetsExtractor = new AssetsExtractor(this.options)
    }

    handle(compilation) {
        var srcArray = this.assetsExtractor.extractAssets(compilation.assets)

        // 外部的css文件。如cdn加载的
        if (this.options.externalCssFiles) {
            ;[].concat(this.options.externalCssFiles).map(file => {
                var src = fs.readFileSync(file, 'utf-8')
                var css = this.assetsExtractor.extractor.extractColors(src)
                srcArray = srcArray.concat(css)
            })
        }

        var output = dropDuplicate(srcArray).join('\n')

        // 自定义后续处理
        if (this.options.resolveCss) {
            output = this.options.resolveCss(output, srcArray)
        }

        // 记录动态的文件名，到每个入口
        this.addToEntryJs(output, compilation)
    }

    // 自动注入js代码，设置css文件名
    addToEntryJs(output, compilation) {
        var onlyEntrypoints = {
            entrypoints: true,
            errorDetails: false,
            modules: false,
            assets: false,
            children: false,
            chunks: false,
            chunkGroups: false
        }
        var entrypoints = compilation.getStats().toJson(onlyEntrypoints).entrypoints
        Object.keys(entrypoints).forEach(entryName => {
            var entryAssets = entrypoints[entryName].assets
            for (var i = 0, l = entryAssets.length; i < l; i++) {
                var assetName = entryAssets[i]
                if (assetName.slice(-3) === '.js' && assetName.indexOf('manifest.') === -1) {
                    var assetCode = compilation.assets[assetName]
                    if (assetCode && !assetCode._isThemeJsInjected) {
                        var config = {
                            output: output,
                            colors: this.options.matchColors
                        }
                        var cSrc = new ConcatSource(`window.__theme_COLOR_cfg=${JSON.stringify(config)};`, '\n', assetCode)
                        cSrc._isThemeJsInjected = true
                        compilation.assets[assetName] = cSrc
                        break
                    }
                }
            }
        })
    }
}

function dropDuplicate(arr) {
    var map = {}
    var r = []
    for (var s of arr) {
        if (!map[s]) {
            r.push(s)
            map[s] = 1
        }
    }
    return r
}
