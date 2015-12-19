# C++ codebase dependency analyzer

## About

The tool allows to view include dependencies between modules of a C++ project.

TODO: more text here

## Installation
* Install Graphviz:
  <pre>
  $ sudo apt-get install graphviz
  </pre>
* Clone this repository:
  <pre>
  $ git@github.com:deadmorous/cxx-codebase-analyzer.git
  </pre>
* Download third-party components:
  <pre>
  $ cd cxx-codebase-analyzer
  $ ./configure
  </pre>

## Usage
* Optionally choose TCP port number N (defaults to 3000)
* Start web server
  <pre>
  [PORT=N] BUILDDIR=/path/to/build/directory/ SRCDIR=/path/to/source/directory/ node bin/www
  </pre>
* Open a Web browser and go to address ```http://localhost:N``` (where N is the port number you chose)

