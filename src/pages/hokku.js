import React from "react"
import Layout from "../components/layout"
import {StaticImage} from 'gatsby-plugin-image';
import "../index.css"

var hokku = require('../content/hokku.json');
console.log(hokku);

export default function Hokku() {
    return (
						<Layout>
                <h1>Hokku</h1>
                    {
                        hokku.map(el => <div>
                            <p style={{ marginBottom:`4cm` }} />
                            <haiku style={{ color:"white" }}>{el.date}<br/>{el.season}<br/></haiku>
                            <haiku style={{margin:`75px`}}>{el.l1}<br/></haiku>
                            <haiku style={{margin:`100px`}}>{el.l2}<br/></haiku>
                            <haiku style={{margin:`125px`}}>{el.l3}<br/></haiku>
                            <p style={{ marginBottom:`12cm` }} />
                        </div>)
                    }

						</Layout>
    );
}
