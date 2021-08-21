import React from "react"
import { Link } from "gatsby"
import { StaticImage } from "gatsby-plugin-image"
import "../index.css"

export default function Flynav() {
    return (
        <div class="flynav">
						<Link to="/fly/">
						<StaticImage src="../images/fly.png" />
						</Link>
        </div>
    );
}
