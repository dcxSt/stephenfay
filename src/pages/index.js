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

										<b>Fun things I made</b> <br/>
                    <a href="https://ising-2d-lattice.netlify.app/">Ising 2D lattice demo</a>—an interactive rust + wasm ising model simulator, <br/>
                    <a href="https://crates.io/crates/grateful-cli">Grateful CLI</a>—a command line interface built in rust, <br/>
                    <a href="https://lastingdeeppinknetbsd.space-miner.repl.co/">Loxodromes</a>—a p5 js animation, <br/>
                    Minesweeper: <a href="https://minesweepervanillajs.dcxst.repl.co/">play online</a> (JS implementation), or play on a HUGE board locally with the <a href="https://github.com/dcxSt/minesweeper">python implementation</a>, <br/>
										<a href="https://github.com/dcxSt/mcgill_physics_hackathon2020">Snowflake groth cellular automaton</a>, <br/>
										<a href="https://atom-war.dcxst.repl.co/">Atom Wars</a> - a cookie clicker game built on the Rinkeby Etherium test-net, <br/>
										<a href="https://github.com/dcxSt/lipschitz">H-Trees</a> - my first hackathon, <br/>
										<a href="https://github.com/dcxSt/alien_wiki_chrome_extension">Alien Wikipedia</a> - a chrome extension that makes reading wikipedia more entertaining, <br/>
                    <a href="https://github.com/dcxSt/attractors/blob/master/README.md">Strange Attractor orbits</a> - some pretty orbits!

										<br/><br/>
										<b>Currently building</b> <br/>
                    <a href="https://github.com/dcxSt/ising-lib">ising_lib</a> - a rust crate that makes Ising model simulations easy to tune, optimized for parallel computation on gpus. 
										
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
                    <a href="https://aranguri.wordpress.com/">Santi</a>,
                    <a href="https://dhruvikparikh.com/">Dhruvik</a>,
                    <a href="https://noahtren.com/">Noah</a>,
										<br/><br/>
										<b>Self</b> <br/>
										<a href="https://curius.app/stephen-fay">curius profile</a>, <br/>
										Project Euler <a href="https://projecteuler.net/profile/dcxStephen.png">profile</a> and <a href="https://github.com/dcxSt/project-euler">solutions</a>, <br/>
                    <a href="https://www.researchgate.net/profile/Stephen-Fay">Research gate</a>,<br/>
                    <a href="https://scholar.google.com/citations?view_op=list_works&hl=en&user=eMRXnwUAAAAJ">google scholar</a>, <br/>
                    <a href="https://dcxst.github.io/math-tutor/">tutoring business card + teaching philosophy</a>,<br/>
                    <a href="https://stephenfay.substack.com/">Substack newsletter</a>,<br/>
                    <a href="https://www.goodreads.com/user/show/112474373-stephen-fay">Goodreads Profile</a>,<br/>
                    <a href="https://github.com/dcxSt">GitHub</a>, <br/>
										<a href="https://twitter.com/dcxStep">Twitter</a>, <br/>


										<br/><b>Communities</b> <br/>
										<a href="https://bio.school2point0.com/">School2.0</a>, <br/>
										<a href="https://www.recurse.com/">Recurse Center</a>, <br/>
										McGill NeurotechX, <br/>

                    <br/>send me an email: dcxstephen@gmail.com
                </pquote>
								<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
						</Layout>
								/* not very elegant solution for whitespace at bottom of page */
    );
}

