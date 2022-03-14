import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../../components/layout"
import { Link } from "gatsby"
import P153 from "../../assets/p153.pdf"

export default function Mathtest () {
    return (
				<Layout>
            <h2>Project Euler Problem 153</h2>
            <p><a href="https://projecteuler.net/problem=153">Link to the problem.</a><br/>
            You can find the code <a href="https://github.com/dcxSt/project-euler/blob/master/problem%20153%20gaussian%20integers/problem153.py">here</a></p>
            <iframe src={P153} width="800" height="800" title="lala"></iframe>
        </Layout>
    );
}

