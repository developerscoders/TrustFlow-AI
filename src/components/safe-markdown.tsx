import React from 'react';

type InlineProps={text:string};

function InlineMarkdown({text}:InlineProps){
  const tokens=text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).filter(Boolean);
  return <>{tokens.map((token,index)=>{
    if(token.startsWith('**')&&token.endsWith('**'))return <strong key={index}>{token.slice(2,-2)}</strong>;
    if(token.startsWith('*')&&token.endsWith('*'))return <em key={index}>{token.slice(1,-1)}</em>;
    if(token.startsWith('`')&&token.endsWith('`'))return <code key={index}>{token.slice(1,-1)}</code>;
    const link=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if(link)return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <React.Fragment key={index}>{token}</React.Fragment>;
  })}</>;
}

export function SafeMarkdown({content}:{content:string}){
  const blocks=content.replace(/\r\n/g,'\n').split(/\n\s*\n/);
  return <div className="safe-markdown">{blocks.map((block,index)=>{
    const trimmed=block.trim();
    if(!trimmed)return null;
    if(/^```/.test(trimmed))return <pre key={index}><code>{trimmed.replace(/^```[^\n]*\n?/,'').replace(/\n?```$/,'')}</code></pre>;
    const lines=trimmed.split('\n');
    if(lines.every(line=>/^\s*[-*+]\s+/.test(line)))return <ul key={index}>{lines.map((line,lineIndex)=><li key={lineIndex}><InlineMarkdown text={line.replace(/^\s*[-*+]\s+/, '')}/></li>)}</ul>;
    if(lines.every(line=>/^\s*\d+[.)]\s+/.test(line)))return <ol key={index}>{lines.map((line,lineIndex)=><li key={lineIndex}><InlineMarkdown text={line.replace(/^\s*\d+[.)]\s+/, '')}/></li>)}</ol>;
    const heading=trimmed.match(/^(#{1,6})\s+(.+)$/);
    if(heading){const level=heading[1].length;return React.createElement(`h${level}`,{key:index},<InlineMarkdown text={heading[2]}/>);}
    return <p key={index}>{lines.map((line,lineIndex)=><React.Fragment key={lineIndex}>{lineIndex>0&&<br/>}<InlineMarkdown text={line}/></React.Fragment>)}</p>;
  })}</div>;
}
