import fs from 'fs';
import path from 'path';

// ビルドされた dist/index.html 内の巨大なインラインスクリプトを
// <head> から抽出し、<body> の最下部（</body>の直前）に移動させます。
// これにより、DOM要素（#root）が完全に構築された後に実行されるため、
// ダブルクリック（file:// スキーム）でも完璧にReactがマウントされて起動します。
const htmlPath = path.join(process.cwd(), 'dist', 'index.html');

try {
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // インラインスクリプトタグを丸ごと抽出
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
    const match = html.match(scriptRegex);
    
    if (match) {
      const fullScriptTag = match[0];
      
      // 元の位置からスクリプトタグを削除
      html = html.replace(scriptRegex, '');
      
      // type="module"、crossorigin、および前回付与した defer 属性を除去し、ピュアなクラシックスクリプトにします
      let cleanScriptTag = fullScriptTag
        .replace(/type="module"/g, '')
        .replace(/defer/g, '')
        .replace(/crossorigin/g, '');
      
      // </body> の直前（マウントターゲットである #root の下）に挿入します
      html = html.replace('</body>', `${cleanScriptTag}\n</body>`);
      
      fs.writeFileSync(htmlPath, html, 'utf8');
      console.log('✓ Successfully moved inline script to body bottom and converted to classic');
    } else {
      console.error('Error: Inline script tag not found in HTML');
    }
  } else {
    console.error('Error: dist/index.html not found');
  }
} catch (error) {
  console.error('Failed to run postbuild script:', error);
}
