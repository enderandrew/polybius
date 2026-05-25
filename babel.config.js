module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { esmodules: true } }],
		'@vue/cli-plugin-babel/preset'
    ],
	plugins: [
		['@babel/plugin-proposal-decorators', { version: '2023-11' }],
		'@babel/plugin-transform-class-properties'
	]
}
