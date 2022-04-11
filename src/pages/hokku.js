import React from "react"
import Layout from "../components/layout"
import {StaticImage} from 'gatsby-plugin-image';
import "../index.css"

var hokku = require('../content/hokku.json');
console.log(hokku);

// Rendering helper function, 
// indenting style 1 for three line hokku
function L301Hokku(props) {
    const hok = props.hok; // a hok is a single hokku (because hokku is hokku in plural and singular)
    return (
      <div>
        <p style={{ marginBottom:`4cm` }} />
        <haiku style={{ color:"white" }}>{hok.date}<br/>{hok.place}<br/>{hok.season}<br/></haiku>
        <haiku style={{margin:`75px`}}>{hok.l1}<br/></haiku>
        <haiku style={{margin:`100px`}}>{hok.l2}<br/></haiku>
        <haiku style={{margin:`125px`}}>{hok.l3}<br/></haiku>
        <p style={{ marginBottom:`12cm` }} />
      </div>
     )
}

// Rendering helper, 
// another indenting style for three line hokku
function L302Hokku(props) {
  const hok = props.hok; 
  return (
    <div>
      <p style={{ marginBottom:`4cm` }} />
      <haiku style={{ color:"white" }}>{hok.date}<br/>{hok.place}<br/>{hok.season}<br/></haiku>
      <haiku style={{margin:`75px`}}>{hok.l1}<br/></haiku>
      <haiku style={{margin:`100px`}}>{hok.l2}<br/></haiku>
      <haiku style={{margin:`75px`}}>{hok.l3}<br/></haiku>
      <p style={{ marginBottom:`12cm` }} />
    </div>
   )
}

// Rendering helper
// indenting style for four line hokku (split-second line)
function L401Hokku(props) {
  const hok = props.hok;
  return (
    <div>
      <p style={{ marginBottom:`4cm` }} />
      <haiku style={{ color:"white" }}>{hok.date}<br/>{hok.place}<br/>{hok.season}<br/></haiku>
      <haiku style={{margin:`75px`}}>{hok.l1}<br/></haiku>
      <haiku style={{margin:`120px`}}>{hok.l2}<br/></haiku>
      <haiku style={{margin:`120px`}}>{hok.l3}<br/></haiku>
      <haiku style={{margin:`75px`}}>{hok.l4}<br/></haiku>
      <p style={{ marginBottom:`12cm` }} />
    </div>
  )
}


function RenderHokku(props) {
    const hok = props.hok;
    console.log("RenderHokku");
    if (hok.style === "l301") {
        return <L301Hokku hok={hok} />
    } else if (hok.style === "l302") {
        return <L302Hokku hok={hok} />
    } else if (hok.style === "l401") {
        return <L401Hokku hok={hok} />
    }
}

export default function Hokku() {
    return (
						<Layout>
                <h1>Hokku</h1>
                    {
                        hokku.map(el => 
                          // if (el.style == "l301") {
                          // console.log(el.style);
                         // } else if (el.style === "l302") {
                         // }else if (el.style === "l401") {
                          // }
                          <RenderHokku hok={el} />
                        )
                    }

						</Layout>
    );
}
