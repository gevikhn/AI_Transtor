// prompt.js - 简单模板渲染

/**
 * 渲染模板：用 {{key}} 替换 data[key]
 * @param {string} tpl
 * @param {Record<string,string>} data
 */
export function renderTemplate(tpl, data){
  return tpl.replace(/{{(\w+)}}/g,(m,k)=> data[k] != null ? String(data[k]) : '');
}
