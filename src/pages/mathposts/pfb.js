import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../../components/layout"
import { Link } from "gatsby"
import pfb from "../../assets/pfb.pdf"

export default function Mathtest () {
    return (
				<Layout>
            <h2>Polyphase Filter Bank</h2>
            <p>
            A note on the PFB. How it works and how to correct quantization effects. <br/>You can find the code <a href="https://github.com/dcxSt/numerical_integrators">here</a>
            </p>
            <iframe src={pfb} width="800" height="800" title="pfb"></iframe>
        </Layout>
    );
}

