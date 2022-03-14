import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../../components/layout"
import { Link } from "gatsby"
import symplectic_integrators from "../../assets/symplectic_integrators.pdf"

export default function Mathtest () {
    return (
				<Layout>
            <h2>Notes on Symplectic Integrators</h2>
            <p>
            ...and other things.<br/>
            You can find the code <a href="https://github.com/dcxSt/numerical_integrators">here</a>
            </p>
            <iframe src={symplectic_integrators} width="800" height="800" title="lala"></iframe>
        </Layout>
    );
}

