import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../../components/layout"
import { Link } from "gatsby"
import P153 from "../../assets/p153.pdf"

export default function Mathtest () {
    return (
				<Layout>
            <h2>Title here</h2>
            <p>This is ridiculous!</p>
            <iframe src={P153} width="400" height="444" title="lala"></iframe>
        </Layout>
    );
}

