import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';
import analyzer from 'rollup-plugin-analyzer';

export default {
  input: 'src/js/index.js',
  output: {
    file: 'build/bundle.js',
    format: 'iife',
    extend: true,
    name: 'window',
  },
  plugins: [
    postcss(),
    babel(),
    resolve(),
    commonjs(),
    terser(),
    analyzer(),
  ],
};
