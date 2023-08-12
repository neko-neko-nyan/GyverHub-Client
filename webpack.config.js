const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin')
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const CompressionPlugin = require("compression-webpack-plugin");
const zlib = require("zlib");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const webpack = require("webpack");

const isProduction = process.env.NODE_ENV === 'production';

const config = {
    entry: './src/main.js',
    target: "web",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: isProduction ? '[contenthash].js' : '[name].js'
    },
    devServer: {
        open: true,
        host: 'localhost',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'src/index.html',
        }),
        new CleanWebpackPlugin(),
        new CompressionPlugin({
            filename: "[path][base].br",
            algorithm: "brotliCompress",
            compressionOptions: {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                },
            }
        }),
        new MiniCssExtractPlugin({
            filename: '[contenthash].css'
        }),
        new webpack.DefinePlugin({
            'process': 'undefined',
            'window.process': 'undefined',
            'typeof window': JSON.stringify('object'),
            'Buffer': 'Uint8Array',
        }),
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    keep_classnames: false,
                    toplevel: true,
                    module: true,
                    ecma: 2020,
                    format: {
                        comments: false,
                        ecma: 2020,
                        wrap_func_args: false
                    },
                    mangle: {
                        module: true,
                        toplevel: true
                    },
                    compress: {
                        ecma: 2020,
                        keep_fargs: false,
                        unsafe_arrows: true,

                    }
                }
            }),
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: ["cssnano-preset-advanced", {discardComments: {removeAll: true}}],
                }
            }),
        ],
    },
    devtool: 'cheap-source-map',
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/i,
                loader: 'babel-loader',
                options: {
                    cacheDirectory: true,
                    plugins: ["@babel/syntax-dynamic-import"],
                    presets: [
                        ["@babel/preset-env", {
                            targets: "last 3 chrome versions, last 3 edge versions, last 4 opera versions, last 4 firefox versions, not dead",

                        }]
                    ]
                }
            },
            {
                test: /\.s?css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader', 'sass-loader'],
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            },

            // Add your rules for custom modules here
            // Learn more about loaders from https://webpack.js.org/loaders/
        ],
    },
    resolve: {
        fallback: {
            // "url": require.resolve("universal-url-lite")
        }
    }
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
    } else {
        config.mode = 'development';
    }
    return config;
};
