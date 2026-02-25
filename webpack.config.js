const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    entry: {
        app: './client/trades.jsx',
        login: './client/login.jsx',
        changepass: './client/changepass.jsx',
        landing: './client/landing.jsx',
        upgrade: './client/upgrade.jsx',
        admin: './client/admin.jsx',
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'postcss-loader',
                ],
            },
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css',
        }),
    ],
    resolve: {
        extensions: ['.js', '.jsx'],
    },
    mode: 'production',
    watchOptions: {
        aggregateTimeout: 200,
    },
    output: {
        path: path.resolve(__dirname, 'public/assets'),
        filename: '[name]Bundle.js',
    },
};
