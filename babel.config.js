export default {
  presets: [
    ['@babel/preset-env', { targets: { esmodules: true } }]
  ],
  plugins: [
    // Force legacy Stage 1 decorators to match Tempest 2021 code semantics
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    '@babel/plugin-transform-class-properties'
  ]
};