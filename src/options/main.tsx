import { render } from 'preact';
import { OptionsApp } from './OptionsApp';
import './styles.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Options root element was not found');
}

render(<OptionsApp />, root);
