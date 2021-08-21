import React from "react"
import "../index.css"
import { StaticImage } from "gatsby-plugin-image"
import Sidenav from "../components/sidebar"

export default function Home() {
    return (
        <div style={{ color: `black`,margin:`3rem auto` }}>
            <Sidenav /> 
						<div class="main" style={{width:`12cm`}}>
								<h1>Fly</h1>
								<StaticImage src="../images/fly.png" />
						</div>
        </div>
    );
}

