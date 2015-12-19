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
* Make a clean build of your source code and generate the build log, ```buildlog.txt```, containing all g++ invocation commands.
  For example, in CMake-based builds this can be done as follows:
  <pre>
  cd path/to/build/directory/
  cmake path/to/source/directory/
  make clean
  make VERBOSE=ON |tee buildlog.txt
  </pre>
* Optionally choose TCP port number N (defaults to 3000)
* Start web server
  <pre>
  [PORT=N] BUILDDIR=/path/to/build/directory/ SRCDIR=/path/to/source/directory/ node bin/www
  </pre>
* Open a Web browser and go to address ```http://localhost:N``` (where N is the port number you chose)

