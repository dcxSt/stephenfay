import React from "react"
import "../index.css"
import Layout from "../components/layout"

export default function Home() {
    return (
				<Layout>
						<h1>Stephen Fay</h1>
            <pquote style={{ marginTop:'-16px' }}>
                    <b>Welcome to my website!</b>
										<br/><br/>

										<b>Fun things</b> <br/>
										<a href="https://github.com/dcxSt/mcgill_physics_hackathon2020">Snowflake groth cellular automaton</a>, <br/>
										<a href="https://atom-war.dcxst.repl.co/">Atom Wars</a> - a cookie clicker game built on the Rinkeby Etherium test-net, <br/>
										<a href="https://github.com/dcxSt/lipschitz">H-Trees</a> - my first hackathon, <br/>
										<a href="https://github.com/dcxSt/alien_wiki_chrome_extension">Alien Wikipedia</a> - a chrome extension that makes reading wikipedia more entertaining, <br/>
                    <a href="https://github.com/dcxSt/attractors/blob/master/README.md">Strange Attractor orbits</a> - some pretty orbits!
										
										<br/><br/>
										<b>Homies</b> <br/>
										<a href="https://marleyx.com" styel={{ unerline:"none" }}>Marley</a>, 
										<a href="https://marcelgoh.ca/">Marcel</a>,
										<a href="https://rosieyzh.github.io/" style={{ underline:"none" }}>Rosie</a>, 
                    <a href="http://luc.devroye.org/">Luc</a>,
                    <a href="https://abrandenberger.github.io/">Anna</a>,
                    <a href="https://dkhoi148.repl.co/">Khoi</a>,
                    <a href="https://tiffanyyong.github.io/">Tiffany</a>,
                    <a href="https://diegolopez.me/">Diego</a>,
                    <a href="https://shereenelaidi.github.io/">Shereen</a>,
                    <a href="https://daocheny.github.io/">Dao Chen</a>,
										<br/><br/>
										<b>Self</b> <br/>
										<a href="https://curius.app/stephen-fay">curious profile</a>, 
										<a href="https://projecteuler.net/profile/dcxStephen.png">project euler profile</a>, 
                    <br/><br/>send me an email: dcxstephen@gmail.com
                </pquote>
								<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
						</Layout>
								/* not very elegant solution for whitespace at bottom of page */
    );
}

