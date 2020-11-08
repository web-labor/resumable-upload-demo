module.exports = {
  publicPath: './',
  outputDir: 'gzzgmiddle',
  devServer: {
    proxy: {
      '/test': {
        target: 'http://192.168.0.109:3000/',
        changeOrigin: true,
        secure: false,
        pathRewrite: {
          '^/test': '/test'
        }
      },
    }
  },
}
